require('dotenv').config();

const API_URL = 'https://gql.api.pult.com/v1/graphql';

const SLACK_CHANNEL = process.env.SLACK_CHANNEL || '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_DM_USER_ID = process.env.SLACK_DM_USER_ID || '';
const PULT_LOGIN_EMAIL = process.env.PULT_LOGIN_EMAIL || '';

function parseInteger(value, defaultValue) {
  const parsed = parseInt(String(value ?? '').trim() || String(defaultValue), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

const DRY_RUN = parseBoolean(process.env.DRY_RUN, false);
const AUTH_SERVER_PORT = parseInteger(process.env.AUTH_SERVER_PORT, 8787);
const AUTH_SERVER_BIND_HOST = String(process.env.AUTH_SERVER_BIND_HOST || '0.0.0.0').trim();
const AUTH_SERVER_BASE_URL =
  process.env.AUTH_SERVER_BASE_URL || `http://localhost:${AUTH_SERVER_PORT}`;

function parseTargetUsersEnv(envString) {
  if (!envString) return [];
  return envString
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || '';
      const lastName = parts.slice(1).join(' ');
      return { firstName, lastName };
    });
}

const TARGET_USERS_LIST = parseTargetUsersEnv(process.env.TARGET_USERS);

module.exports = {
  API_URL,
  SLACK_CHANNEL,
  SLACK_BOT_TOKEN,
  SLACK_DM_USER_ID,
  PULT_LOGIN_EMAIL,
  AUTH_SERVER_PORT,
  AUTH_SERVER_BIND_HOST,
  AUTH_SERVER_BASE_URL,
  DRY_RUN,
  TARGET_USERS_LIST,
};
