const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { describe, it, before, afterEach, after } = require('node:test');
const pultApi = require('../src/pult/api');

const originalFetch = global.fetch;
const envPath = path.resolve(process.cwd(), '.env');
let originalEnvContent = '';
let hadEnvFile = false;

function jsonResponse(obj) {
  return { json: async () => obj };
}

describe('E2E: manual token refresh behavior', () => {
  before(() => {
    hadEnvFile = fs.existsSync(envPath);
    if (hadEnvFile) {
      originalEnvContent = fs.readFileSync(envPath, 'utf-8');
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.SLACK_DM_USER_ID;
    delete process.env.DRY_RUN;
    delete process.env.AUTH_SERVER_AUTOSTART;
    delete process.env.TOKEN_REFRESH_WAIT_MS;
    delete process.env.TOKEN_REFRESH_POLL_MS;
    delete process.env.PULT_LOGIN_EMAIL;
  });

  after(() => {
    if (hadEnvFile) fs.writeFileSync(envPath, originalEnvContent);
    else if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
  });

  it('waits for manual token and retries API', async () => {
    process.env.DRY_RUN = 'true';
    process.env.SLACK_DM_USER_ID = 'U_TEST';
    process.env.AUTH_SERVER_AUTOSTART = 'false';
    process.env.TOKEN_REFRESH_WAIT_MS = '2000';
    process.env.TOKEN_REFRESH_POLL_MS = '20';
    process.env.PULT_LOGIN_EMAIL = 'user@example.com';
    process.env.AUTH_TOKEN = 'expired.token';

    const expiredEnv = /^AUTH_TOKEN=.*/m.test(originalEnvContent)
      ? originalEnvContent.replace(/^AUTH_TOKEN=.*/m, 'AUTH_TOKEN=expired.token')
      : `${originalEnvContent.trimEnd()}\nAUTH_TOKEN=expired.token\n`;
    fs.writeFileSync(envPath, expiredEnv);

    let gqlCall = 0;
    global.fetch = async (url) => {
      const asString = String(url);
      if (asString.includes('/health')) {
        throw new Error('auth server unreachable in test');
      }
      if (!asString.includes('gql.api.pult.com')) {
        throw new Error(`Unexpected URL: ${asString}`);
      }
      gqlCall += 1;
      if (gqlCall === 1) return jsonResponse({ errors: [{ message: 'Could not verify JWT' }] });
      if (gqlCall === 2) return jsonResponse({ data: { userLoginMagicEmail: true } });
      if (gqlCall === 3) {
        return jsonResponse({
          data: { trackPollsRange: [{ resultOfficeId: 1, resultOfficeDeskId: 2 }] },
        });
      }
      throw new Error(`Unexpected GraphQL call index: ${gqlCall}`);
    };

    setTimeout(() => {
      const current = fs.readFileSync(envPath, 'utf-8');
      fs.writeFileSync(envPath, current.replace(/^AUTH_TOKEN=.*/m, 'AUTH_TOKEN=new.jwt.token'));
    }, 120);

    const result = await pultApi.getMyStatus();
    assert.ok(result);
    assert.equal(process.env.AUTH_TOKEN, 'new.jwt.token');
  });
});
