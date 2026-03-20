const assert = require('assert');
const { describe, it } = require('node:test');
const { __internals } = require('../src/auth/server');

describe('auth/server normalizeMagicLink', () => {
  it('keeps full magic link unchanged', () => {
    const link = 'https://app.pult.com/login/magic-link/1234-5678-abcd-ef01';
    assert.equal(__internals.normalizeMagicLink(link), link);
  });

  it('accepts token-only input', () => {
    const token = '1234-5678-abcd-ef01';
    assert.equal(
      __internals.normalizeMagicLink(token),
      'https://app.pult.com/login/magic-link/1234-5678-abcd-ef01',
    );
  });

  it('rejects invalid input', () => {
    assert.equal(__internals.normalizeMagicLink('not-a-magic-link'), null);
  });

  it('rejects non-pult domains', () => {
    const link = 'https://evil.example/login/magic-link/1234-5678-abcd-ef01';
    assert.equal(__internals.normalizeMagicLink(link), null);
  });

  it('rejects embedded pult URL inside attacker URL', () => {
    const link =
      'https://evil.example/?next=https://app.pult.com/login/magic-link/1234-5678-abcd-ef01';
    assert.equal(__internals.normalizeMagicLink(link), null);
  });

  it('rejects non-https pult links', () => {
    const link = 'http://app.pult.com/login/magic-link/1234-5678-abcd-ef01';
    assert.equal(__internals.normalizeMagicLink(link), null);
  });

  it('normalizes valid pult links with query params', () => {
    const link = 'https://app.pult.com/login/magic-link/1234-5678-abcd-ef01?utm_source=email';
    assert.equal(
      __internals.normalizeMagicLink(link),
      'https://app.pult.com/login/magic-link/1234-5678-abcd-ef01',
    );
  });
});
