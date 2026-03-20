const assert = require('assert');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { describe, it, afterEach } = require('node:test');
const { parseRoomDefinitions, findRoom } = require('../src/rooms/rooms');

describe('rooms/parseRoomDefinitions', () => {
  let originalCwd;

  afterEach(async () => {
    if (originalCwd) {
      process.chdir(originalCwd);
      originalCwd = undefined;
    }
  });

  it('parses room headers and coordinate lines from room-definition.md', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pult-rooms-'));
    originalCwd = process.cwd();
    process.chdir(tmp);
    await fs.writeFile(
      path.join(tmp, 'room-definition.md'),
      ['Alpha Room', '1,2', '3,4', '', 'Beta', '10,10'].join('\n'),
      'utf-8',
    );

    const rooms = await parseRoomDefinitions();
    assert.deepEqual(rooms['Alpha Room'], [
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
    assert.deepEqual(rooms.Beta, [{ x: 10, y: 10 }]);
    assert.equal(findRoom(rooms, 3, 4), 'Alpha Room');
  });

  it('rejects when room-definition.md is missing', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pult-rooms-empty-'));
    originalCwd = process.cwd();
    process.chdir(tmp);

    await assert.rejects(parseRoomDefinitions(), { code: 'ENOENT' });
  });
});
