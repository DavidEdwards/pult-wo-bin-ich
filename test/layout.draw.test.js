const assert = require('assert');
const { describe, it } = require('node:test');
const { __internals } = require('../src/layout/draw');

describe('layout/draw internals', () => {
  it('findOfficeBounds computes width and height', () => {
    const walls = ['x:2:3', 'y:4:5'];
    const { findOfficeBounds } = __internals;
    const { width, height } = findOfficeBounds(walls);
    // x:2:3 => width >= 4, height >= 2; y:4:5 => width >= 4, height >= 6
    assert.equal(width, 4);
    assert.equal(height, 6);
  });

  it('findRoomFromWalls returns null when no bounds found', () => {
    const walls = [];
    const { findRoomFromWalls } = __internals;
    const res = findRoomFromWalls(walls, 1, 1);
    assert.equal(res, null);
  });

  it('sanitizeAvatarUrl keeps valid https avatar URL', () => {
    const { sanitizeAvatarUrl } = __internals;
    const input = 'https://cdn.example.com/avatar.png?size=128';
    assert.equal(sanitizeAvatarUrl(input), input);
  });

  it('sanitizeAvatarUrl rejects localhost/private targets', () => {
    const { sanitizeAvatarUrl } = __internals;
    assert.equal(sanitizeAvatarUrl('https://localhost/avatar.png'), null);
    assert.equal(sanitizeAvatarUrl('https://127.0.0.1/avatar.png'), null);
    assert.equal(sanitizeAvatarUrl('https://192.168.1.50/avatar.png'), null);
    assert.equal(sanitizeAvatarUrl('http://cdn.example.com/avatar.png'), null);
  });
});
