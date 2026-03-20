const assert = require('assert');
const { describe, it, afterEach } = require('node:test');
const path = require('path');

const configPath = path.join(__dirname, '../src/config/index.js');
const indexPath = path.join(__dirname, '../index.js');

function reloadIndex() {
  delete require.cache[require.resolve(configPath)];
  delete require.cache[require.resolve(indexPath)];
  return require(indexPath);
}

describe('index/buildIsTargetUser', () => {
  afterEach(() => {
    delete require.cache[require.resolve(configPath)];
    delete require.cache[require.resolve(indexPath)];
  });

  it('matches TARGET_USERS entries (comma-separated)', () => {
    const old = process.env.TARGET_USERS;
    process.env.TARGET_USERS = 'Ada Lovelace, Alan Turing';
    try {
      const { buildIsTargetUser } = reloadIndex();
      const isTarget = buildIsTargetUser();
      assert.equal(isTarget({ firstName: 'Ada', lastName: 'Lovelace' }), true);
      assert.equal(isTarget({ firstName: 'alan', lastName: 'turing' }), true);
      assert.equal(isTarget({ firstName: 'Bob', lastName: 'Smith' }), false);
      assert.equal(isTarget(null), false);
    } finally {
      if (old === undefined) delete process.env.TARGET_USERS;
      else process.env.TARGET_USERS = old;
    }
  });

  it('falls back to built-in defaults when TARGET_USERS is empty', () => {
    const old = process.env.TARGET_USERS;
    process.env.TARGET_USERS = '';
    try {
      const { buildIsTargetUser } = reloadIndex();
      const isTarget = buildIsTargetUser();
      assert.equal(isTarget({ firstName: 'David', lastName: 'Edwards' }), true);
      assert.equal(isTarget({ firstName: 'carsten', lastName: 'kett' }), true);
      assert.equal(isTarget({ firstName: 'Ada', lastName: 'Lovelace' }), false);
    } finally {
      if (old === undefined) delete process.env.TARGET_USERS;
      else process.env.TARGET_USERS = old;
    }
  });
});
