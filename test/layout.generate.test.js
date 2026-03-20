const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { describe, it, afterEach } = require('node:test');
const { generateOfficeLayout } = require('../src/layout/draw');

describe('layout/generateOfficeLayout', () => {
  let originalCwd;

  afterEach(async () => {
    if (originalCwd) {
      process.chdir(originalCwd);
      originalCwd = undefined;
    }
  });

  it('writes PNG files and returns the primary filename', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pult-layout-'));
    originalCwd = process.cwd();
    process.chdir(tmp);
    try {
      await fs.mkdir(path.join(tmp, 'layout-history'), { recursive: true });

      const walls = ['x:0:0', 'x:0:1', 'y:0:0', 'y:1:0'];
      const office = {
        serializedWalls: JSON.stringify(walls),
        desks: [
          {
            id: 1,
            x: 0,
            y: 0,
            disabled: false,
          },
        ],
      };

      const out = await generateOfficeLayout(office, () => false);
      assert.equal(out, 'office-layout.png');

      const rootPng = path.join(tmp, 'office-layout.png');
      const stat = await fs.stat(rootPng);
      assert.ok(stat.size > 100, 'expected non-trivial PNG');

      const hist = await fs.readdir(path.join(tmp, 'layout-history'));
      assert.ok(hist.some((f) => f.startsWith('office-layout-') && f.endsWith('.png')));
    } finally {
      process.chdir(originalCwd);
      originalCwd = undefined;
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
