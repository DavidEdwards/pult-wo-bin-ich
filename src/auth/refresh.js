const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { AUTH_SERVER_PORT, AUTH_SERVER_BASE_URL, AUTH_SERVER_BIND_HOST } = require('../config');
const { sendSlackDirectMessage } = require('../slack/client');
const { startAuthServer } = require('./server');
const { sendMagicEmailLogin, extractTokenFromMagicLink, updateEnvFile } = require('./token');

let hasSentManualRefreshAlert = false;
const ENV_PATH = path.resolve(__dirname, '../..', '.env');

function parseInteger(value, defaultValue) {
  const parsed = parseInt(String(value ?? '').trim() || String(defaultValue), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function getRefreshWaitMs() {
  return parseInteger(process.env.TOKEN_REFRESH_WAIT_MS, 30 * 60 * 1000);
}

function getRefreshPollMs() {
  return parseInteger(process.env.TOKEN_REFRESH_POLL_MS, 2000);
}

function shouldAutoStartAuthServer() {
  return parseBoolean(process.env.AUTH_SERVER_AUTOSTART, true);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopAuthServer(server, timeoutMs = 3000) {
  if (!server || typeof server.close !== 'function') return true;

  const closeResult = await Promise.race([
    new Promise((resolve) => {
      try {
        server.close(() => resolve('closed'));
      } catch {
        resolve('error');
      }
    }),
    sleep(timeoutMs).then(() => 'timeout'),
  ]);

  if (closeResult === 'closed') {
    console.log('Stopped temporary auth helper server.');
    return true;
  }

  if (typeof server.closeAllConnections === 'function') {
    try {
      server.closeAllConnections();
    } catch {
      // no-op: best-effort cleanup
    }
  }
  if (typeof server.closeIdleConnections === 'function') {
    try {
      server.closeIdleConnections();
    } catch {
      // no-op: best-effort cleanup
    }
  }

  if (closeResult === 'timeout') {
    console.warn('Timed out while stopping auth helper server. Continuing execution.');
  } else {
    console.warn('Auth helper server stop encountered an error. Continuing execution.');
  }
  return false;
}

function isJWTError(error) {
  const errorMessage = (error && error.message) || String(error || '');
  return (
    errorMessage.includes('JWT') ||
    errorMessage.includes('JWTExpired') ||
    errorMessage.includes('Could not verify JWT') ||
    errorMessage.includes('Unauthorized') ||
    errorMessage.includes('401')
  );
}

function isUsableInterface(name) {
  if (!name) return false;
  if (name === 'lo' || name === 'tailscale0') return true;
  if (name === 'docker0') return false;
  if (name.startsWith('br-')) return false;
  if (name.startsWith('veth')) return false;
  if (name.startsWith('virbr')) return false;
  if (name.startsWith('cni')) return false;
  return true;
}

function isLoopbackHost(host) {
  const normalized = String(host || '')
    .trim()
    .toLowerCase();
  return ['127.0.0.1', 'localhost', '::1'].includes(normalized);
}

function getAuthServerCandidateUrls() {
  const urls = new Set();
  urls.add(AUTH_SERVER_BASE_URL);
  urls.add(`http://localhost:${AUTH_SERVER_PORT}`);
  urls.add(`http://127.0.0.1:${AUTH_SERVER_PORT}`);

  if (isLoopbackHost(AUTH_SERVER_BIND_HOST)) {
    return Array.from(urls);
  }

  const interfaces = os.networkInterfaces();
  for (const [ifName, entries] of Object.entries(interfaces)) {
    if (!isUsableInterface(ifName)) continue;
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') continue;
      urls.add(`http://${entry.address}:${AUTH_SERVER_PORT}`);
    }
  }

  return Array.from(urls);
}

function buildManualRefreshMessage() {
  const urls = getAuthServerCandidateUrls();
  const urlLines = urls.map((url) => `- ${url}`).join('\n');
  const primaryUrl = urls[0] || AUTH_SERVER_BASE_URL;
  return [
    ':warning: Pult JWT expired and manual refresh is required.',
    '',
    'Auth helper URLs:',
    urlLines,
    '',
    `Open helper UI: ${primaryUrl}/`,
    `API request magic link (POST): ${primaryUrl}/request-magic-link`,
    `API submit magic link (POST): ${primaryUrl}/submit-magic-link`,
    '',
    'After submitting, the app will continue automatically.',
  ].join('\n');
}

async function notifyManualRefreshRequired() {
  if (hasSentManualRefreshAlert) return false;
  hasSentManualRefreshAlert = true;
  const message = buildManualRefreshMessage();
  const sent = await sendSlackDirectMessage(message);
  if (!sent) {
    console.warn('Could not send Slack DM alert. Manual refresh instructions:');
    console.warn(message);
  }
  return sent;
}

async function readAuthTokenFromEnvFile() {
  try {
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    const match = content.match(/^AUTH_TOKEN=(.*)$/m);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

async function readEnvStateFromFile() {
  try {
    const stat = await fs.stat(ENV_PATH);
    const content = await fs.readFile(ENV_PATH, 'utf-8');
    const match = content.match(/^AUTH_TOKEN=(.*)$/m);
    return {
      token: match ? match[1].trim() : '',
      mtimeMs: Number(stat.mtimeMs) || 0,
    };
  } catch {
    return { token: '', mtimeMs: 0 };
  }
}

async function isAuthServerHealthy(baseUrl) {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/health`);
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data && data.ok);
  } catch {
    return false;
  }
}

async function ensureAuthServerForRefresh(onTokenUpdated) {
  const candidateUrls = getAuthServerCandidateUrls();
  for (const url of candidateUrls) {
    if (await isAuthServerHealthy(url)) {
      return { server: null, url, startedByProcess: false };
    }
  }

  if (!shouldAutoStartAuthServer()) {
    console.warn('Auth server is not reachable and AUTH_SERVER_AUTOSTART=false.');
    return { server: null, url: AUTH_SERVER_BASE_URL, startedByProcess: false };
  }

  const server = startAuthServer({
    onTokenUpdated: (token) => {
      if (token) process.env.AUTH_TOKEN = token;
      if (typeof onTokenUpdated === 'function') {
        onTokenUpdated(token);
      }
    },
  });

  const primaryUrl = AUTH_SERVER_BASE_URL;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isAuthServerHealthy(primaryUrl)) {
      return { server, url: primaryUrl, startedByProcess: true };
    }
    await sleep(250);
  }

  console.warn(`Auth server did not become healthy at ${primaryUrl}, continuing anyway.`);
  return { server, url: primaryUrl, startedByProcess: true };
}

async function waitForUpdatedToken(
  previousToken,
  timeoutMs,
  pollMs,
  didReceiveToken,
  initialMtimeMs = 0,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof didReceiveToken === 'function' && didReceiveToken()) {
      return true;
    }

    const state = await readEnvStateFromFile();
    const fileToken = state.token;
    const envToken = (process.env.AUTH_TOKEN || '').trim();
    if (fileToken && fileToken !== previousToken) {
      process.env.AUTH_TOKEN = fileToken;
      return true;
    }
    if (fileToken && state.mtimeMs > initialMtimeMs) {
      process.env.AUTH_TOKEN = fileToken;
      return true;
    }
    if (envToken && envToken !== previousToken) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
}

async function handleTokenRefresh() {
  const initialEnvState = await readEnvStateFromFile();
  const previousToken = (process.env.AUTH_TOKEN || initialEnvState.token || '').trim();
  const timeoutMs = getRefreshWaitMs();
  const pollMs = Math.max(getRefreshPollMs(), 200);
  let tokenSubmitted = false;

  console.log('JWT token expired. Starting manual refresh flow...');
  const { server, startedByProcess } = await ensureAuthServerForRefresh(() => {
    tokenSubmitted = true;
  });

  if (startedByProcess) {
    console.log('Auth helper server started automatically for token refresh.');
  }

  await notifyManualRefreshRequired();

  const emailSent = await sendMagicEmailLogin();
  if (!emailSent) {
    console.warn(
      'Could not trigger magic email automatically. You can still request it via /request-magic-link',
    );
  }

  console.log(`Waiting for updated AUTH_TOKEN (timeout: ${Math.ceil(timeoutMs / 1000)}s)...`);
  const refreshed = await waitForUpdatedToken(
    previousToken,
    timeoutMs,
    pollMs,
    () => tokenSubmitted,
    initialEnvState.mtimeMs,
  );

  if (server) {
    await stopAuthServer(server);
  }

  if (!refreshed) {
    console.error('Timed out waiting for a new token submission.');
    return false;
  }

  hasSentManualRefreshAlert = false;
  console.log('Detected updated AUTH_TOKEN. Continuing execution.');
  return true;
}

module.exports = {
  isJWTError,
  handleTokenRefresh,
  __internals: {
    sendMagicEmailLogin,
    extractTokenFromMagicLink,
    updateEnvFile,
    notifyManualRefreshRequired,
    getAuthServerCandidateUrls,
    buildManualRefreshMessage,
    readAuthTokenFromEnvFile,
    readEnvStateFromFile,
    waitForUpdatedToken,
    isAuthServerHealthy,
    stopAuthServer,
  },
};
