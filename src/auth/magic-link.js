const MAGIC_LINK_HOST = 'app.pult.com';
const MAGIC_LINK_PATH_PREFIX = '/login/magic-link/';
const MAGIC_LINK_TOKEN_PATTERN = /^[a-f0-9-]{8,128}$/i;

function isValidMagicLinkToken(token) {
  return MAGIC_LINK_TOKEN_PATTERN.test(String(token || '').trim());
}

function extractTokenFromMagicLinkInput(value, options = {}) {
  const { allowTokenOnly = true } = options;
  const input = String(value || '').trim();
  if (!input) return null;

  if (allowTokenOnly && isValidMagicLinkToken(input)) {
    return input;
  }

  let parsed;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.hostname.toLowerCase() !== MAGIC_LINK_HOST) return null;

  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
  if (!path.startsWith(MAGIC_LINK_PATH_PREFIX)) return null;

  const token = path.slice(MAGIC_LINK_PATH_PREFIX.length);
  if (!token || token.includes('/')) return null;
  if (!isValidMagicLinkToken(token)) return null;

  return token;
}

function normalizeMagicLink(value, options = {}) {
  const token = extractTokenFromMagicLinkInput(value, options);
  if (!token) return null;
  return `https://${MAGIC_LINK_HOST}/login/magic-link/${token}`;
}

module.exports = {
  normalizeMagicLink,
  extractTokenFromMagicLinkInput,
  __internals: {
    isValidMagicLinkToken,
    MAGIC_LINK_HOST,
    MAGIC_LINK_PATH_PREFIX,
  },
};
