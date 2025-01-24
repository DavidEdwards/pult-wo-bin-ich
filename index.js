const fs = require('fs').promises;
require('dotenv').config()
const { WebClient } = require('@slack/web-api');
const path = require('path');

const API_URL = 'https://gql.api.pult.com/v1/graphql';

// Headers for API requests
const headers = {
  'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
  'Content-Type': 'application/json',
  'Origin': 'https://app.pult.com',
  'Referer': 'https://app.pult.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
};

// Initialize Slack client
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// Get Slack channel from environment variable, default to 'android-dev' if not set
const SLACK_CHANNEL = process.env.SLACK_CHANNEL || 'android-dev';

// Update room image mappings to point to local files
const roomImages = {
  'Team Room 1': 'images/Team-Room-1.png',
  'Team Room 2': 'images/Team-Room-2.png',
  'Team Room 3': 'images/Team-Room-3.png',
  'Office 1': 'images/Office-1.png',
  'Office 2': 'images/Office-2.png',
  'Office 3': 'images/Office-3.png'
};

// Update sendSlackMessage to use the configured channel
async function sendSlackMessage(message, imagePath) {
  try {
    const messageBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message
        }
      }
    ];

    let result;
    
    if (imagePath) {
      try {
        // Upload the file
        const imageUpload = await slack.files.upload({
          channels: SLACK_CHANNEL,
          initial_comment: message,
          file: await fs.readFile(path.join(__dirname, imagePath)),
          filename: path.basename(imagePath)
        });
        
        return;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError.message);
      }
    }

    // Send text-only message if no image or upload failed
    await slack.chat.postMessage({
      channel: SLACK_CHANNEL,
      blocks: messageBlocks,
      text: message
    });
  } catch (error) {
    console.error('Error sending Slack message:', error.message);
  }
}

// Parse room definitions from the file
async function parseRoomDefinitions() {
  const content = await fs.readFile('room-definition.md', 'utf-8');
  const rooms = {};
  let currentRoom = null;

  content.split('\n').forEach(line => {
    if (line.trim() === '') return;

    // If line doesn't contain a comma, it's a room name
    if (!line.includes(',')) {
      currentRoom = line.trim();
      rooms[currentRoom] = [];
    } else {
      // Parse coordinates
      const [x, y] = line.split(',').map(coord => parseInt(coord.trim()));
      rooms[currentRoom].push({ x, y });
    }
  });

  return rooms;
}

// Find room name for given coordinates
function findRoom(rooms, x, y) {
  for (const [roomName, coordinates] of Object.entries(rooms)) {
    if (coordinates.some(coord => coord.x === x && coord.y === y)) {
      return roomName;
    }
  }
  return 'Unknown Room';
}

// Get my current status
async function getMyStatus() {
  const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

  const query = {
    "query": "\n    query GetTrackPollsByRange($fromDate: String!, $toDate: String!) {\n  trackPollsRange(fromDate: $fromDate, toDate: $toDate) {\n    id\n    organizationId\n    hris_time_off_id\n    result\n    resultOfficeId\n    resultOfficeDeskId\n    pollDate\n    time_start\n    time_end\n    timestampCreated\n    timestampUpdated\n    user {\n      id\n      uuid\n      id\n      avatar\n      email\n      firstName\n      lastName\n    }\n    userId\n    resultOffice {\n      id\n      name\n      label\n      emoji\n    }\n    resultOfficeDesk {\n      timestampDeleted\n    }\n  }\n}\n    ",
    "variables": {
      "fromDate": today,
      "toDate": today
    },
    "operationName": "GetTrackPollsByRange"
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  // Check if we got any results for today
  if (!data.data?.trackPollsRange || data.data.trackPollsRange.length === 0) {
    return null;
  }

  return data.data.trackPollsRange[0];
}

// Get office status
async function getOfficeStatus() {
  const query = {
    "query": "\n    query GetTrackOffices {\n  track_office(where: {timestamp_archived: {_is_null: true}}) {\n    capacity\n    emoji\n    id\n    label\n    mode\n    mode_hybrid_padding\n    name\n    organizationId\n    prioritySeats\n    priorityUntil\n    serializedAreaLabels\n    serializedAreas\n    serializedWalls\n    desks: track_office_desks(where: {timestampDeleted: {_is_null: true}}) {\n      disabled\n      id\n      name\n      officeId\n      reservedByUserId\n      timestampCreated\n      timestampDeleted\n      x\n      y\n      tags: track_office_desks_tags {\n        tag: track_office_desk_tag {\n          id\n          color\n          name\n          timestampCreated\n        }\n      }\n      reservedByUser: user {\n        id\n        uuid\n        firstName\n        lastName\n        avatar\n      }\n      deskGroupWhitelistId\n      connect_desks {\n        connect {\n          destination_id\n          source_id\n        }\n      }\n    }\n  }\n}\n    ",
    "variables": {},
    "operationName": "GetTrackOffices"
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(query)
  });

  const data = await response.json();

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  return data.data.track_office;
}

async function main() {
  try {
    const rooms = await parseRoomDefinitions();
    const myStatus = await getMyStatus();

    let statusMessage;

    if (!myStatus) {
      statusMessage = "You are working from home today.";
      console.log(statusMessage);
      //await sendSlackMessage(statusMessage);
      return;
    }

    const officeStatus = await getOfficeStatus();
    const office = officeStatus.find(o => o.id === myStatus.resultOfficeId);

    if (!office) {
      statusMessage = "Could not find office information.";
      console.log(statusMessage);
      //await sendSlackMessage(statusMessage);
      return;
    }

    const myDesk = office.desks.find(d => d.id === myStatus.resultOfficeDeskId);

    if (!myDesk) {
      statusMessage = "Could not find desk information.";
      console.log(statusMessage);
      //await sendSlackMessage(statusMessage);
      return;
    }

    const roomName = findRoom(rooms, myDesk.x, myDesk.y);
    statusMessage = `You are assigned to ${roomName} today.`;
    console.log(statusMessage);
    await sendSlackMessage(statusMessage, roomImages[roomName]);

  } catch (error) {
    console.error('Error:', error.message);
    //await sendSlackMessage(`Error: ${error.message}`);
  }
}

main();
