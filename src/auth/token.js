const fs = require('fs').promises;
const path = require('path');
const { API_URL } = require('../config');
const { extractTokenFromMagicLinkInput } = require('./magic-link');

const ENV_PATH = path.resolve(__dirname, '../..', '.env');

function buildGraphqlHeaders() {
  return {
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
}

function sanitizeAuthToken(value) {
  const token = String(value || '').trim();
  if (!token) return null;
  if (/[\r\n]/.test(token)) return null;
  return token;
}

async function sendMagicEmailLogin() {
  try {
    const email = process.env.PULT_LOGIN_EMAIL || '';
    if (!email) {
      console.error('PULT_LOGIN_EMAIL is not set. Please add it to your .env file.');
      return false;
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: buildGraphqlHeaders(),
      body: JSON.stringify({
        query:
          '\n    mutation LoginMagicEmail($input: UserMagicEmailLoginInput!) {\n  userLoginMagicEmail(input: $input)\n}\n    ',
        variables: { input: { email } },
        operationName: 'LoginMagicEmail',
      }),
    });

    const data = await response.json();
    if (data.errors) {
      console.error('Magic email login failed:', data.errors);
      return false;
    }

    console.log('Magic email login sent successfully');
    return true;
  } catch (error) {
    console.error('Error sending magic email login:', error.message);
    return false;
  }
}

async function extractTokenFromMagicLink(magicLink) {
  try {
    console.log('Extracting token from magic link...');

    const magicLinkUuid = extractTokenFromMagicLinkInput(magicLink);
    if (!magicLinkUuid) {
      console.error('Could not extract magic link UUID from URL');
      return null;
    }

    console.log('Magic link UUID:', magicLinkUuid);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: buildGraphqlHeaders(),
      body: JSON.stringify({
        query:
          '\n    mutation LoginMagicToken($input: UserMagicTokenLoginInput!) {\n  userLoginMagicToken(input: $input) {\n    ... on UserLoginPayload {\n      __typename\n      token\n    }\n    ... on MutationError {\n      __typename\n      code\n      message\n    }\n  }\n}\n    ',
        variables: { input: { token: magicLinkUuid } },
        operationName: 'LoginMagicToken',
      }),
    });

    const data = await response.json();

    if (data.data && data.data.userLoginMagicToken) {
      const result = data.data.userLoginMagicToken;
      if (result.__typename === 'UserLoginPayload' && result.token) {
        const sanitizedToken = sanitizeAuthToken(result.token);
        if (!sanitizedToken) {
          console.error('Magic link exchange returned an invalid token format');
          return null;
        }
        console.log('Successfully exchanged magic link for JWT token');
        return sanitizedToken;
      }
      if (result.__typename === 'MutationError') {
        console.error('Magic link exchange error:', result.message);
        return null;
      }
    }

    console.error('Unexpected response from magic link exchange:', data);
    return null;
  } catch (error) {
    console.error('Error extracting token from magic link:', error.message);
    return null;
  }
}

async function updateEnvFile(newToken) {
  try {
    const sanitizedToken = sanitizeAuthToken(newToken);
    if (!sanitizedToken) {
      console.error('Refusing to write invalid AUTH_TOKEN to .env');
      return false;
    }

    let envContent = '';
    try {
      envContent = await fs.readFile(ENV_PATH, 'utf-8');
    } catch {
      envContent = '';
    }

    if (/^AUTH_TOKEN=.*/m.test(envContent)) {
      envContent = envContent.replace(/^AUTH_TOKEN=.*/m, `AUTH_TOKEN=${sanitizedToken}`);
    } else {
      envContent = envContent.trimEnd() + `\nAUTH_TOKEN=${sanitizedToken}\n`;
    }

    await fs.writeFile(ENV_PATH, envContent);
    console.log('Updated .env file with new token');

    process.env.AUTH_TOKEN = sanitizedToken;
    return true;
  } catch (error) {
    console.error('Error updating .env file:', error.message);
    return false;
  }
}

module.exports = {
  sendMagicEmailLogin,
  extractTokenFromMagicLink,
  updateEnvFile,
};
