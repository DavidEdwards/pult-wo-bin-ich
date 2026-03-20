const assert = require('assert');
const { describe, it, afterEach } = require('node:test');
const { isJWTError, __internals } = require('../src/auth/refresh');

// Mock global fetch in tests
const originalFetch = global.fetch;

function restoreFetch() {
  global.fetch = originalFetch;
}

async function runWithMockedFetch(sequence, fn) {
  let callIndex = 0;
  global.fetch = async (...args) => {
    const handler = sequence[callIndex] || sequence[sequence.length - 1];
    callIndex += 1;
    return handler(...args);
  };
  try {
    await fn();
  } finally {
    restoreFetch();
  }
}

function jsonResponse(obj) {
  return { json: async () => obj };
}

describe('auth/refresh', () => {
  afterEach(() => {
    restoreFetch();
  });

  it('isJWTError identifies JWT-related messages', () => {
    assert.equal(isJWTError(new Error('JWTExpired: token')), true);
    assert.equal(isJWTError(new Error('Could not verify JWT')), true);
    assert.equal(isJWTError(new Error('Unauthorized')), true);
    assert.equal(isJWTError(new Error('401')), true);
    assert.equal(isJWTError(new Error('Other error')), false);
  });

  it('sendMagicEmailLogin returns false when PULT_LOGIN_EMAIL missing', async () => {
    const { sendMagicEmailLogin } = __internals;
    const old = process.env.PULT_LOGIN_EMAIL;
    delete process.env.PULT_LOGIN_EMAIL;
    const result = await sendMagicEmailLogin();
    process.env.PULT_LOGIN_EMAIL = old;
    assert.equal(result, false);
  });

  it('extractTokenFromMagicLink exchanges magic link for token', async () => {
    const { extractTokenFromMagicLink } = __internals;
    await runWithMockedFetch(
      [
        // Exchange magic token
        async () =>
          jsonResponse({
            data: {
              userLoginMagicToken: { __typename: 'UserLoginPayload', token: 'new.jwt.token' },
            },
          }),
      ],
      async () => {
        const token = await extractTokenFromMagicLink(
          'https://app.pult.com/login/magic-link/1234-5678',
        );
        assert.equal(token, 'new.jwt.token');
      },
    );
  });

  it('extractTokenFromMagicLink rejects non-pult links without calling API', async () => {
    const { extractTokenFromMagicLink } = __internals;
    let didCallFetch = false;
    global.fetch = async () => {
      didCallFetch = true;
      throw new Error('fetch should not be called for invalid links');
    };
    try {
      const token = await extractTokenFromMagicLink(
        'https://evil.example/?next=https://app.pult.com/login/magic-link/1234-5678',
      );
      assert.equal(token, null);
      assert.equal(didCallFetch, false);
    } finally {
      restoreFetch();
    }
  });

  it('waitForUpdatedToken resolves when submission signal is set', async () => {
    const { waitForUpdatedToken } = __internals;
    let submitted = false;
    setTimeout(() => {
      submitted = true;
    }, 50);
    const ok = await waitForUpdatedToken('same-token', 2000, 20, () => submitted);
    assert.equal(ok, true);
  });

  it('stopAuthServer continues when close callback never fires', async () => {
    const { stopAuthServer } = __internals;
    let closeCalled = false;
    let forceClosed = false;
    const fakeServer = {
      close: () => {
        closeCalled = true;
        // Intentionally never invoking callback to simulate hanging close.
      },
      closeAllConnections: () => {
        forceClosed = true;
      },
    };

    const startedAt = Date.now();
    const closedCleanly = await stopAuthServer(fakeServer, 30);
    const elapsedMs = Date.now() - startedAt;

    assert.equal(closeCalled, true);
    assert.equal(forceClosed, true);
    assert.equal(closedCleanly, false);
    assert.ok(elapsedMs < 500);
  });
});
