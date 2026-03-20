const assert = require('assert');
const { describe, it, afterEach } = require('node:test');
const { __internals } = require('../src/pult/api');

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

function jsonResponse(obj) {
  return { json: async () => obj };
}

describe('pult/api getHeaders', () => {
  it('includes Authorization header from AUTH_TOKEN', () => {
    const old = process.env.AUTH_TOKEN;
    process.env.AUTH_TOKEN = 'abc123';
    const h = __internals.getHeaders();
    process.env.AUTH_TOKEN = old;
    assert.equal(h.Authorization, 'Bearer abc123');
    assert.equal(h['Content-Type'], 'application/json');
    assert.ok(!h.Origin && !h.Referer && h['User-Agent']);
  });
});

describe('pult/api GraphQL (mocked fetch)', () => {
  it('getMyStatus returns null when trackPollsRange is empty', async () => {
    global.fetch = async () => jsonResponse({ data: { trackPollsRange: [] } });
    const { getMyStatus } = require('../src/pult/api');
    const row = await getMyStatus();
    assert.equal(row, null);
  });

  it('getMyStatus returns the first poll row', async () => {
    const poll = { id: 'p1', resultOfficeId: 9, resultOfficeDeskId: 3 };
    global.fetch = async () => jsonResponse({ data: { trackPollsRange: [poll, { id: 'p2' }] } });
    const { getMyStatus } = require('../src/pult/api');
    const row = await getMyStatus();
    assert.deepEqual(row, poll);
  });

  it('getMyStatus throws on GraphQL errors when not a JWT issue', async () => {
    global.fetch = async () => jsonResponse({ errors: [{ message: 'GraphQL validation failed' }] });
    const { getMyStatus } = require('../src/pult/api');
    await assert.rejects(getMyStatus(), { message: 'GraphQL validation failed' });
  });

  it('getOfficeStatus returns trackOfficesWithDesks array', async () => {
    const offices = [{ id: 1, desks: [] }];
    global.fetch = async () => jsonResponse({ data: { trackOfficesWithDesks: offices } });
    const { getOfficeStatus } = require('../src/pult/api');
    const out = await getOfficeStatus();
    assert.deepEqual(out, offices);
  });

  it('getCoworkerData returns empty array when field is missing', async () => {
    global.fetch = async () => jsonResponse({ data: {} });
    const { getCoworkerData } = require('../src/pult/api');
    const out = await getCoworkerData();
    assert.deepEqual(out, []);
  });

  it('getCoworkerData returns coworker rows', async () => {
    const rows = [{ result: 'office_accepted', userId: 'u1' }];
    global.fetch = async () => jsonResponse({ data: { trackPollsCoworkerRange: rows } });
    const { getCoworkerData } = require('../src/pult/api');
    const out = await getCoworkerData();
    assert.deepEqual(out, rows);
  });
});
