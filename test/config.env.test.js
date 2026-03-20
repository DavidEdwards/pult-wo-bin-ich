const assert = require('assert');
const path = require('path');
const { describe, it, afterEach } = require('node:test');

const configPath = path.join(__dirname, '../src/config/index.js');

function reloadConfig() {
  delete require.cache[require.resolve(configPath)];
  return require(configPath);
}

describe('config env parsing', () => {
  afterEach(() => {
    delete require.cache[require.resolve(configPath)];
  });

  it('parses TARGET_USERS into firstName / lastName pairs', () => {
    const old = process.env.TARGET_USERS;
    process.env.TARGET_USERS = 'Ada Lovelace, Marie Curie';
    try {
      const { TARGET_USERS_LIST } = reloadConfig();
      assert.deepEqual(TARGET_USERS_LIST, [
        { firstName: 'Ada', lastName: 'Lovelace' },
        { firstName: 'Marie', lastName: 'Curie' },
      ]);
    } finally {
      if (old === undefined) delete process.env.TARGET_USERS;
      else process.env.TARGET_USERS = old;
    }
  });

  it('sets DRY_RUN from truthy env strings', () => {
    const old = process.env.DRY_RUN;
    process.env.DRY_RUN = 'true';
    try {
      const { DRY_RUN } = reloadConfig();
      assert.equal(DRY_RUN, true);
    } finally {
      if (old === undefined) delete process.env.DRY_RUN;
      else process.env.DRY_RUN = old;
    }
  });
});
