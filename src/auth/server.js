const http = require('http');
const { URLSearchParams } = require('url');
const { AUTH_SERVER_PORT, AUTH_SERVER_BASE_URL, AUTH_SERVER_BIND_HOST } = require('../config');
const tokenService = require('./token');
const { normalizeMagicLink } = require('./magic-link');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > 64 * 1024) {
      throw new Error('Request body too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function parseBody(req, bodyText) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!bodyText) return {};

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(bodyText);
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(bodyText);
    const out = {};
    for (const [key, value] of params.entries()) out[key] = value;
    return out;
  }

  return {};
}

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pult Token Helper</title>
  <style>
    body { font-family: sans-serif; max-width: 720px; margin: 2rem auto; line-height: 1.4; }
    form { margin: 1rem 0; padding: 1rem; border: 1px solid #ddd; border-radius: 8px; }
    input[type=text] { width: 100%; padding: 0.5rem; }
    button { padding: 0.5rem 0.75rem; }
    code { background: #f6f8fa; padding: 0.1rem 0.25rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Pult Token Helper</h1>
  <p>Use this local page to refresh your Pult token.</p>
  <form method="post" action="/request-magic-link">
    <h3>1) Request magic link email</h3>
    <p>This calls Pult's <code>userLoginMagicEmail</code> for <code>PULT_LOGIN_EMAIL</code>.</p>
    <button type="submit">Send magic link email</button>
  </form>
  <form method="post" action="/submit-magic-link">
    <h3>2) Submit magic link</h3>
    <p>Paste the full link from your email.</p>
    <input type="text" name="magicLink" placeholder="https://app.pult.com/login/magic-link/..." />
    <div style="margin-top: 0.5rem;">
      <button type="submit">Exchange and save token</button>
    </div>
  </form>
  <p>Health check: <a href="/health">/health</a></p>
</body>
</html>`;
}

function acceptsHtml(req) {
  return String(req.headers.accept || '')
    .toLowerCase()
    .includes('text/html');
}

function getOwnString(payload, key) {
  if (!payload || typeof payload !== 'object') return '';
  if (!Object.hasOwn(payload, key)) return '';
  const value = payload[key];
  return typeof value === 'string' ? value : '';
}

function getAllowedOrigins() {
  const allowed = new Set([
    `http://localhost:${AUTH_SERVER_PORT}`,
    `http://127.0.0.1:${AUTH_SERVER_PORT}`,
    `http://[::1]:${AUTH_SERVER_PORT}`,
  ]);
  try {
    allowed.add(new URL(AUTH_SERVER_BASE_URL).origin);
  } catch {
    // Ignore invalid AUTH_SERVER_BASE_URL and keep local defaults.
  }
  return allowed;
}

function normalizeHostPortFromRequestHost(hostHeader) {
  const host = String(hostHeader || '').trim();
  if (!host) return null;
  try {
    const parsed = new URL(`http://${host}`);
    const normalizedPort = parsed.port || '80';
    return `${parsed.hostname.toLowerCase()}:${normalizedPort}`;
  } catch {
    return null;
  }
}

function normalizeHostPortFromOrigin(origin) {
  try {
    const parsed = new URL(origin);
    const normalizedPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return `${parsed.hostname.toLowerCase()}:${normalizedPort}`;
  } catch {
    return null;
  }
}

function isAllowedPostOrigin(req) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true;
  const requestHostPort = normalizeHostPortFromRequestHost(req.headers.host);
  const originHostPort = normalizeHostPortFromOrigin(origin);
  if (requestHostPort && originHostPort && requestHostPort === originHostPort) {
    return true;
  }
  return getAllowedOrigins().has(origin);
}

function sendMethodNotAllowed(req, res, allowedMethods) {
  res.setHeader('Allow', allowedMethods.join(', '));
  const message = `Method ${req.method} not allowed for this endpoint.`;
  if (acceptsHtml(req)) {
    sendHtml(res, 405, `${renderHomePage()}<p><strong>${message}</strong></p>`);
    return;
  }
  sendJson(res, 405, { ok: false, message });
}

async function handleRequest(req, res, handlers) {
  const { sendMagicEmailLogin, extractTokenFromMagicLink, updateEnvFile, onTokenUpdated } =
    handlers;
  let url;
  try {
    url = new URL(req.url, `http://localhost:${AUTH_SERVER_PORT}`);
  } catch {
    sendJson(res, 400, { ok: false, message: 'Invalid request URL.' });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    sendHtml(res, 200, renderHomePage());
    return;
  }

  if (url.pathname === '/request-magic-link') {
    if (req.method === 'GET') {
      if (acceptsHtml(req)) {
        sendHtml(
          res,
          200,
          `${renderHomePage()}<p><strong>Use the form button to request a magic link.</strong></p>`,
        );
        return;
      }
      sendJson(res, 405, { ok: false, message: 'Use POST /request-magic-link.' });
      return;
    }
    if (req.method !== 'POST') {
      sendMethodNotAllowed(req, res, ['POST']);
      return;
    }
    if (!isAllowedPostOrigin(req)) {
      sendJson(res, 403, { ok: false, message: 'Forbidden origin.' });
      return;
    }
    const ok = await sendMagicEmailLogin();
    if (acceptsHtml(req)) {
      const message = ok
        ? 'Magic link email requested successfully.'
        : 'Failed to request magic link.';
      sendHtml(res, ok ? 200 : 500, `${renderHomePage()}<p><strong>${message}</strong></p>`);
      return;
    }
    sendJson(res, ok ? 200 : 500, {
      ok,
      message: ok ? 'Magic link email requested successfully.' : 'Failed to request magic link.',
    });
    return;
  }

  if (url.pathname === '/submit-magic-link') {
    if (req.method === 'GET') {
      const message = 'Paste your magic link into the form below and submit.';
      if (acceptsHtml(req)) {
        sendHtml(res, 200, `${renderHomePage()}<p><strong>${message}</strong></p>`);
        return;
      }
      sendJson(res, 405, { ok: false, message: 'Use POST /submit-magic-link.' });
      return;
    }
    if (req.method !== 'POST') {
      sendMethodNotAllowed(req, res, ['POST']);
      return;
    }
    if (!isAllowedPostOrigin(req)) {
      sendJson(res, 403, { ok: false, message: 'Forbidden origin.' });
      return;
    }
    let payload = {};
    const bodyText = await readBody(req);
    payload = parseBody(req, bodyText);
    const magicLinkInput =
      getOwnString(payload, 'magicLink') || getOwnString(payload, 'magic_link');
    const magicLink = normalizeMagicLink(magicLinkInput);

    if (!magicLink) {
      const message = 'Missing or invalid magic link.';
      if (acceptsHtml(req)) {
        sendHtml(res, 400, `${renderHomePage()}<p><strong>${message}</strong></p>`);
        return;
      }
      sendJson(res, 400, { ok: false, message });
      return;
    }

    const newToken = await extractTokenFromMagicLink(magicLink);
    if (!newToken) {
      const message = 'Failed to exchange magic link for token.';
      if (acceptsHtml(req)) {
        sendHtml(res, 500, `${renderHomePage()}<p><strong>${message}</strong></p>`);
        return;
      }
      sendJson(res, 500, { ok: false, message });
      return;
    }

    const updated = await updateEnvFile(newToken);
    if (!updated) {
      const message = 'Token was created but failed to update .env.';
      if (acceptsHtml(req)) {
        sendHtml(res, 500, `${renderHomePage()}<p><strong>${message}</strong></p>`);
        return;
      }
      sendJson(res, 500, { ok: false, message });
      return;
    }

    if (typeof onTokenUpdated === 'function') {
      try {
        onTokenUpdated(newToken);
      } catch (callbackError) {
        console.warn('onTokenUpdated callback failed:', callbackError.message);
      }
    }

    const successMessage = 'Token updated successfully.';
    if (acceptsHtml(req)) {
      sendHtml(res, 200, `${renderHomePage()}<p><strong>${successMessage}</strong></p>`);
      return;
    }
    sendJson(res, 200, { ok: true, message: successMessage });
    return;
  }

  sendJson(res, 404, {
    ok: false,
    message: 'Not found',
    endpoints: ['GET /', 'GET /health', 'POST /request-magic-link', 'POST /submit-magic-link'],
  });
}

function startAuthServer(options = {}) {
  const port = options.port || AUTH_SERVER_PORT;
  const bindHost = options.host || AUTH_SERVER_BIND_HOST;
  const handlers = {
    sendMagicEmailLogin: options.sendMagicEmailLogin || tokenService.sendMagicEmailLogin,
    extractTokenFromMagicLink:
      options.extractTokenFromMagicLink || tokenService.extractTokenFromMagicLink,
    updateEnvFile: options.updateEnvFile || tokenService.updateEnvFile,
    onTokenUpdated: options.onTokenUpdated,
  };
  const server = http.createServer((req, res) => {
    handleRequest(req, res, handlers).catch((error) => {
      sendJson(res, 500, { ok: false, message: error.message || 'Internal server error' });
    });
  });
  server.on('error', (error) => {
    console.error('Pult auth server error:', error.message);
  });
  // Bind to all interfaces by default; override when explicitly configured.
  server.listen(port, bindHost, () => {
    console.log(`Pult auth server listening on ${AUTH_SERVER_BASE_URL} (bind ${bindHost})`);
  });
  return server;
}

module.exports = {
  startAuthServer,
  __internals: {
    normalizeMagicLink,
    parseBody,
  },
};
