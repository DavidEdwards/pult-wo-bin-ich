const { API_URL } = require('../config');
const { isJWTError, handleTokenRefresh } = require('../auth/refresh');

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.AUTH_TOKEN}`,
    'Content-Type': 'application/json',
    // Node fetch requests should not spoof browser Origin/Referer.
    // Pult's API rejects those with "Cross-origin requests are not allowed."
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  };
}

async function getMyStatus() {
  const today = new Date().toISOString().split('T')[0];
  const queryBody = {
    query:
      '\n    query GetTrackPollsByRange($fromDate: String!, $toDate: String!) {\n  trackPollsRange(fromDate: $fromDate, toDate: $toDate) {\n    id\n    organizationId\n    hris_time_off_id\n    result\n    resultOfficeId\n    resultOfficeDeskId\n    pollDate\n    time_start\n    time_end\n    timestampCreated\n    timestampUpdated\n    user {\n      id\n      uuid\n      id\n      avatar\n      email\n      firstName\n      lastName\n    }\n    userId\n    resultOffice {\n      id\n      name\n      label\n      emoji\n    }\n    resultOfficeDesk {\n      timestampDeleted\n    }\n  }\n}\n    ',
    variables: { fromDate: today, toDate: today },
    operationName: 'GetTrackPollsByRange',
  };

  async function postQueryOnce() {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(queryBody),
    });
    return response.json();
  }

  let data = await postQueryOnce();
  if (data.errors) {
    const error = new Error(data.errors[0].message);
    if (isJWTError(error)) {
      console.log('JWT error detected in getMyStatus, attempting token refresh...');
      const refreshed = await handleTokenRefresh();
      if (refreshed) {
        data = await postQueryOnce();
      }
    }
  }

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  if (!data.data?.trackPollsRange || data.data.trackPollsRange.length === 0) {
    return null;
  }
  return data.data.trackPollsRange[0];
}

async function getOfficeStatus() {
  const queryBody = {
    query:
      '\n    query GetTrackOffices {\n  trackOfficesWithDesks {\n    capacity\n    emoji\n    id\n    label\n    mode\n    modeHybridPadding\n    name\n    organizationId\n    prioritySeats\n    priorityUntil\n    serializedAreaLabels\n    serializedAreas\n    serializedWalls\n    desks {\n      disabled\n      id\n      name\n      reservedByUserId\n      x\n      y\n      reservedByUser {\n        id\n        uuid\n        firstName\n        lastName\n        avatar\n      }\n    }\n  }\n}\n    ',
    variables: {},
    operationName: 'GetTrackOffices',
  };

  async function postQueryOnce() {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(queryBody),
    });
    return response.json();
  }

  let data = await postQueryOnce();
  if (data.errors) {
    const error = new Error(data.errors[0].message);
    if (isJWTError(error)) {
      console.log('JWT error detected in getOfficeStatus, attempting token refresh...');
      const refreshed = await handleTokenRefresh();
      if (refreshed) {
        data = await postQueryOnce();
      }
    }
  }

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  return data.data.trackOfficesWithDesks;
}

async function getCoworkerData() {
  const today = new Date().toISOString().split('T')[0];
  const queryBody = {
    query:
      '\n    query GetCoworkerTrackPolls($date: String!) {\n  trackPollsCoworkerRange(date: $date) {\n    id\n    result\n    resultOfficeId\n    organizationId\n    hris_time_off_id\n    pollDate\n    resultOfficeDeskId\n    time_end\n    time_start\n    timestampCreated\n    timestampUpdated\n    userId\n    anonymousUserId\n    anonymousUserHidden\n    user {\n      id\n      uuid\n      firstName\n      lastName\n      avatar\n      email\n      organizationGroupId\n      isGuest\n      guestEmail\n    }\n  }\n}\n    ',
    variables: { date: today },
    operationName: 'GetCoworkerTrackPolls',
  };

  async function postQueryOnce() {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(queryBody),
    });
    return response.json();
  }

  let data = await postQueryOnce();
  if (data.errors) {
    const error = new Error(data.errors[0].message);
    if (isJWTError(error)) {
      console.log('JWT error detected in getCoworkerData, attempting token refresh...');
      const refreshed = await handleTokenRefresh();
      if (refreshed) {
        data = await postQueryOnce();
      }
    }
  }

  if (data.errors) {
    throw new Error(data.errors[0].message);
  }

  // Keep returning the same shape the rest of the app expects:
  // an array of poll objects with result/resultOfficeId/resultOfficeDeskId/userId/user
  return data.data.trackPollsCoworkerRange || [];
}

module.exports = {
  getMyStatus,
  getOfficeStatus,
  getCoworkerData,
  __internals: { getHeaders },
};
