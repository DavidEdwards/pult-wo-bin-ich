const assert = require('assert');
const path = require('path');
const { describe, it, after, beforeEach } = require('node:test');

const configPath = path.join(__dirname, '../src/config/index.js');

// Ensure DRY_RUN for this suite
const oldDryRun = process.env.DRY_RUN;
process.env.DRY_RUN = 'true';

describe('slack/client dry-run', () => {
  beforeEach(() => {
    delete require.cache[require.resolve(configPath)];
    delete require.cache[require.resolve('../src/slack/client')];
  });

  it('does not throw when DRY_RUN is enabled and skips upload', async () => {
    const { sendSlackMessage: send } = require('../src/slack/client');
    await send('Test message', 'nonexistent.png');
    assert.ok(true);
  });

  it('sendSlackDirectMessage resolves true without calling the API', async () => {
    const { sendSlackDirectMessage: dm } = require('../src/slack/client');
    const ok = await dm('token refresh instructions');
    assert.equal(ok, true);
  });
});

after(() => {
  if (oldDryRun === undefined) delete process.env.DRY_RUN;
  else process.env.DRY_RUN = oldDryRun;
});
