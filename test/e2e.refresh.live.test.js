const { test } = require('node:test');

test(
  'LIVE E2E: manual refresh requires human interaction',
  {
    skip: 'Manual refresh is interactive via auth server and not suitable for automated live tests.',
  },
  async () => {},
);
