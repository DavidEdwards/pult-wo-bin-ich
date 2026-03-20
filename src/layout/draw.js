const path = require('path');
const fs = require('fs').promises;
const { createCanvas, registerFont, loadImage } = require('canvas');
const crypto = require('crypto');
const net = require('net');

const FONT_FAMILY = 'Gilmer, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
// Keeping for readability, but not used directly in code paths
// const FONT_SIZE = '14px';
const REM_TO_PX = 16;
const CELL_SIZE = 2 * REM_TO_PX;
const PADDING = 3 * REM_TO_PX;

try {
  registerFont(path.join(process.cwd(), 'fonts/gilmer-regular.ttf'), { family: 'Gilmer' });
  registerFont(path.join(process.cwd(), 'fonts/gilmer-medium.ttf'), {
    family: 'Gilmer',
    weight: 'medium',
  });
  registerFont(path.join(process.cwd(), 'fonts/gilmer-bold.ttf'), {
    family: 'Gilmer',
    weight: 'bold',
  });
} catch (error) {
  console.warn('Could not load Gilmer fonts, falling back to system font:', error.message);
}

async function getAvatarPath(avatarUrl) {
  const safeAvatarUrl = sanitizeAvatarUrl(avatarUrl);
  if (!safeAvatarUrl) return null;

  const hash = crypto.createHash('md5').update(safeAvatarUrl).digest('hex');
  const avatarDir = path.join(process.cwd(), 'layout-history', 'avatars');
  const avatarPath = path.join(avatarDir, `${hash}.png`);

  try {
    await fs.access(avatarPath);
    return avatarPath;
  } catch {
    try {
      await fs.mkdir(avatarDir, { recursive: true });
      const response = await fetch(safeAvatarUrl);
      if (!response.ok) return null;

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) return null;

      const maxAvatarBytes = 5 * 1024 * 1024;
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(contentLength) && contentLength > maxAvatarBytes) return null;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxAvatarBytes) return null;

      await fs.writeFile(avatarPath, buffer);
      return avatarPath;
    } catch (error) {
      console.warn(`Failed to download avatar from ${safeAvatarUrl}:`, error.message);
      return null;
    }
  }
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  if (parts[0] === 0) return true;
  return false;
}

function isDisallowedAvatarHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) return isPrivateIpv4(host);
  if (ipVersion === 6) {
    return (
      host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')
    );
  }

  return false;
}

function sanitizeAvatarUrl(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (isDisallowedAvatarHost(parsed.hostname)) return null;
  return parsed.toString();
}

function getTimestampedFilename() {
  const date = new Date();
  return `office-layout-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}.png`;
}

function findOfficeBounds(walls) {
  let maxX = 0;
  let maxY = 0;
  walls.forEach((wall) => {
    const [direction, position, coordinate] = wall.split(':');
    const pos = parseInt(position, 10);
    const coord = parseInt(coordinate, 10);
    if (direction === 'x') {
      maxX = Math.max(maxX, coord + 1);
      maxY = Math.max(maxY, pos);
    } else if (direction === 'y') {
      maxX = Math.max(maxX, pos);
      maxY = Math.max(maxY, coord + 1);
    }
  });
  return { width: maxX, height: maxY };
}

function findRoomFromWalls(walls, targetX, targetY) {
  const horizontalWalls = [];
  const verticalWalls = [];

  walls.forEach((wall) => {
    const parts = wall.split(':');
    const direction = parts[0];
    const position = parseInt(parts[1], 10);
    const coordinate = parseInt(parts[2], 10);
    if (direction === 'x') {
      horizontalWalls.push({ y: position, x: coordinate });
    } else if (direction === 'y') {
      verticalWalls.push({ x: position, y: coordinate });
    }
  });

  const leftCandidates = verticalWalls
    .filter((w) => w.x <= targetX && w.y === targetY)
    .map((w) => w.x);
  const rightCandidates = verticalWalls
    .filter((w) => w.x > targetX && w.y === targetY)
    .map((w) => w.x);
  const topCandidates = horizontalWalls
    .filter((w) => w.y <= targetY && w.x === targetX)
    .map((w) => w.y);
  const bottomCandidates = horizontalWalls
    .filter((w) => w.y > targetY && w.x === targetX)
    .map((w) => w.y);

  const leftWall = leftCandidates.length ? Math.max(...leftCandidates) : undefined;
  const rightWall = rightCandidates.length ? Math.min(...rightCandidates) : undefined;
  const topWall = topCandidates.length ? Math.max(...topCandidates) : undefined;
  const bottomWall = bottomCandidates.length ? Math.min(...bottomCandidates) : undefined;

  if (
    leftWall === undefined ||
    rightWall === undefined ||
    topWall === undefined ||
    bottomWall === undefined
  ) {
    console.log('Could not find enclosing walls', { leftWall, rightWall, topWall, bottomWall });
    return null;
  }

  return { x1: leftWall, y1: topWall, x2: rightWall, y2: bottomWall };
}

async function drawDesk(ctx, desk, x, y, size) {
  if (desk.disabled) {
    ctx.fillStyle = '#ddd';
  } else if (desk.reservedByUserId) {
    ctx.fillStyle = '#ffb74d';
  } else {
    ctx.fillStyle = '#90caf9';
  }

  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(x, y, size, size);

  if (desk.reservedByUserId && desk.reservedByUser) {
    try {
      if (desk.reservedByUser.avatar) {
        const avatarPath = await getAvatarPath(desk.reservedByUser.avatar);
        if (avatarPath) {
          const avatar = await loadImage(avatarPath);
          const avatarSize = size * 0.7;
          const avatarX = x + (size - avatarSize) / 2;
          const avatarY = y + (size - avatarSize) / 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(
            avatarX + avatarSize / 2,
            avatarY + avatarSize / 2,
            avatarSize / 2,
            0,
            Math.PI * 2,
          );
          ctx.clip();
          ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
        } else {
          drawInitials();
        }
      } else {
        drawInitials();
      }
    } catch (error) {
      console.warn(`Failed to draw avatar for ${desk.reservedByUser.firstName}:`, error.message);
      drawInitials();
    }
  }

  function drawInitials() {
    ctx.fillStyle = '#000';
    ctx.font = `${0.75 * REM_TO_PX}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    const firstInitial = desk.reservedByUser.firstName[0] || '';
    const lastInitial = desk.reservedByUser.lastName ? desk.reservedByUser.lastName[0] : '';
    const initials = firstInitial + (lastInitial || '');
    ctx.fillText(initials, x + size / 2, y + size / 2 + 0.25 * REM_TO_PX);
  }
}

async function generateOfficeLayout(office, isTargetUser) {
  const walls = JSON.parse(office.serializedWalls);
  const bounds = findOfficeBounds(walls);
  const canvasWidth = (bounds.width * 2 + 6) * REM_TO_PX;
  const canvasHeight = (bounds.height * 2 + 8) * REM_TO_PX;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#eee';
  for (let i = PADDING; i < PADDING + bounds.width * CELL_SIZE; i += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(i, PADDING);
    ctx.lineTo(i, PADDING + bounds.height * CELL_SIZE);
    ctx.stroke();
  }
  for (let i = PADDING; i < PADDING + bounds.height * CELL_SIZE; i += CELL_SIZE) {
    ctx.beginPath();
    ctx.moveTo(PADDING, i);
    ctx.lineTo(PADDING + bounds.width * CELL_SIZE, i);
    ctx.stroke();
  }

  if (office.serializedWalls) {
    try {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      walls.forEach((wall, index) => {
        try {
          const [direction, position, coordinate] = wall.split(':');
          const pos = parseInt(position, 10);
          const coord = parseInt(coordinate, 10);
          ctx.beginPath();
          if (direction === 'x') {
            ctx.moveTo(coord * CELL_SIZE + PADDING, pos * CELL_SIZE + PADDING);
            ctx.lineTo((coord + 1) * CELL_SIZE + PADDING, pos * CELL_SIZE + PADDING);
          } else if (direction === 'y') {
            ctx.moveTo(pos * CELL_SIZE + PADDING, coord * CELL_SIZE + PADDING);
            ctx.lineTo(pos * CELL_SIZE + PADDING, (coord + 1) * CELL_SIZE + PADDING);
          }
          ctx.stroke();
        } catch (wallError) {
          console.error(`Error drawing wall at index ${index}:`, wallError);
          console.log('Wall data:', wall);
        }
      });
      ctx.lineWidth = 1;
    } catch (parseError) {
      console.error('Error parsing walls:', parseError);
      console.log('Raw serializedWalls:', office.serializedWalls);
    }
  }

  for (const desk of office.desks) {
    const x = desk.x * CELL_SIZE + PADDING;
    const y = desk.y * CELL_SIZE + PADDING;
    const size = CELL_SIZE - 0.125 * REM_TO_PX;
    await drawDesk(ctx, desk, x, y, size);
  }

  const targetDesk = office.desks.find(
    (desk) => desk.reservedByUser && isTargetUser(desk.reservedByUser),
  );
  if (targetDesk) {
    try {
      const roomBounds = findRoomFromWalls(walls, targetDesk.x, targetDesk.y);
      if (roomBounds) {
        ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
        const roomX = roomBounds.x1 * CELL_SIZE + PADDING;
        const roomY = roomBounds.y1 * CELL_SIZE + PADDING;
        const roomWidth = (roomBounds.x2 - roomBounds.x1) * CELL_SIZE;
        const roomHeight = (roomBounds.y2 - roomBounds.y1) * CELL_SIZE;
        ctx.fillRect(roomX, roomY, roomWidth, roomHeight);
      }
    } catch (error) {
      console.error('Error highlighting room:', error);
      console.log('Raw serializedWalls:', office.serializedWalls);
    }
  }

  const legendY = canvas.height - 2 * REM_TO_PX;
  const legendBoxSize = REM_TO_PX;
  const legendSpacing = 10 * REM_TO_PX;
  const textOffset = 2 * REM_TO_PX;
  ctx.font = `bold ${0.875 * REM_TO_PX}px ${FONT_FAMILY}`;

  let xPos = PADDING;
  ctx.fillStyle = '#90caf9';
  ctx.fillRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = '#000';
  ctx.fillText('Available', xPos + legendBoxSize + textOffset, legendY + legendBoxSize * 0.75);

  xPos += legendSpacing;
  ctx.fillStyle = '#ffb74d';
  ctx.fillRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = '#000';
  ctx.fillText('Reserved', xPos + legendBoxSize + textOffset, legendY + legendBoxSize * 0.75);

  xPos += legendSpacing;
  ctx.fillStyle = '#ddd';
  ctx.fillRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = '#000';
  ctx.fillText('Disabled', xPos + legendBoxSize + textOffset, legendY + legendBoxSize * 0.75);

  xPos += legendSpacing;
  ctx.fillStyle = 'rgba(76, 175, 80, 0.2)';
  ctx.fillRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.strokeStyle = '#666';
  ctx.strokeRect(xPos, legendY, legendBoxSize, legendBoxSize);
  ctx.fillStyle = '#000';
  ctx.fillText('Target Room', xPos + legendBoxSize + textOffset, legendY + legendBoxSize * 0.75);

  const buffer = canvas.toBuffer('image/png');
  await fs.writeFile('office-layout.png', buffer);

  const archiveDir = path.join(process.cwd(), 'layout-history');
  await fs.mkdir(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, getTimestampedFilename());
  await fs.writeFile(archivePath, buffer);
  return 'office-layout.png';
}

module.exports = {
  generateOfficeLayout,
  __internals: { findOfficeBounds, findRoomFromWalls, sanitizeAvatarUrl },
};
