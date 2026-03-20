require('dotenv').config();

const { getMyStatus, getOfficeStatus, getCoworkerData } = require('./src/pult/api');
const { parseRoomDefinitions, findRoom } = require('./src/rooms/rooms');
const { generateOfficeLayout } = require('./src/layout/draw');
const { sendSlackMessage } = require('./src/slack/client');
const { TARGET_USERS_LIST } = require('./src/config');
const { isJWTError } = require('./src/auth/refresh');

function buildIsTargetUser() {
  const configured = (TARGET_USERS_LIST || []).map((u) => ({
    first: (u.firstName || '').toLowerCase(),
    last: (u.lastName || '').toLowerCase(),
  }));
  return function isTargetUser(user) {
    if (!user) return false;
    const userFirst = (user.firstName || '').toLowerCase();
    const userLast = (user.lastName || '').toLowerCase();
    if (configured.length === 0) {
      return (
        (userFirst === 'david' && userLast === 'edwards') ||
        (userFirst === 'carsten' && userLast === 'kett')
      );
    }
    return configured.some((tu) => tu.first === userFirst && tu.last === userLast);
  };
}

async function runOnce() {
  const rooms = await parseRoomDefinitions();
  const myStatus = await getMyStatus();
  const coworkerData = await getCoworkerData();

  if (!myStatus || myStatus.resultOfficeId === null || myStatus.resultOfficeDeskId === null) {
    console.log('You are working from home today.');
    return;
  }

  const officeStatus = await getOfficeStatus();
  const office = officeStatus.find((o) => o.id === myStatus.resultOfficeId);
  if (!office) {
    console.log('Could not find office information.');
    return;
  }

  office.desks.forEach((desk) => {
    const coworker = coworkerData.find(
      (c) =>
        c.resultOfficeId === office.id &&
        c.resultOfficeDeskId === desk.id &&
        c.result === 'office_accepted',
    );
    if (coworker) {
      desk.reservedByUserId = coworker.userId;
      desk.reservedByUser = coworker.user;
    }
  });

  const myDesk = office.desks.find((d) => d.id === myStatus.resultOfficeDeskId);
  if (!myDesk) {
    console.log('Could not find desk information.');
    return;
  }

  const roomName = findRoom(rooms, myDesk.x, myDesk.y);
  const isTargetUser = buildIsTargetUser();
  const layoutImage = await generateOfficeLayout(office, isTargetUser);

  const statusMessage = `You are assigned to ${roomName} today.`;
  console.log(statusMessage);
  await sendSlackMessage(statusMessage, layoutImage);
}

async function main() {
  try {
    await runOnce();
  } catch (error) {
    if (isJWTError(error)) {
      console.error('Error:', error.message);
      console.log('Token refresh required. Check your Slack DM for instructions.');
      return;
    }
    console.error('Error:', error.message);
  }
}

module.exports = { buildIsTargetUser, runOnce, main };

if (require.main === module) {
  main();
}
