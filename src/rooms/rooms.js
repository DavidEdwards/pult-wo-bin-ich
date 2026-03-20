const fs = require('fs').promises;
const path = require('path');

async function parseRoomDefinitions() {
  const filePath = path.resolve(process.cwd(), 'room-definition.md');
  const content = await fs.readFile(filePath, 'utf-8');
  const rooms = {};
  let currentRoom = null;

  content.split('\n').forEach((line) => {
    if (line.trim() === '') return;
    if (!line.includes(',')) {
      currentRoom = line.trim();
      rooms[currentRoom] = [];
    } else {
      const [x, y] = line.split(',').map((coord) => parseInt(coord.trim(), 10));
      rooms[currentRoom].push({ x, y });
    }
  });

  return rooms;
}

function findRoom(rooms, x, y) {
  for (const [roomName, coordinates] of Object.entries(rooms)) {
    if (coordinates.some((coord) => coord.x === x && coord.y === y)) {
      return roomName;
    }
  }
  return 'Unknown Room';
}

module.exports = { parseRoomDefinitions, findRoom };
