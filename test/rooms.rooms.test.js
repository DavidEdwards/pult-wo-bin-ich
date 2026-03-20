const assert = require('assert');
const { describe, it } = require('node:test');
const { findRoom } = require('../src/rooms/rooms');

describe('rooms/findRoom', () => {
  it('returns correct room name for matching coordinates', () => {
    const rooms = {
      'Room A': [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      'Room B': [{ x: 10, y: 10 }],
    };
    assert.equal(findRoom(rooms, 3, 4), 'Room A');
    assert.equal(findRoom(rooms, 10, 10), 'Room B');
    assert.equal(findRoom(rooms, 0, 0), 'Unknown Room');
  });
});
