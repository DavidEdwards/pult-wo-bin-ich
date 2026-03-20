# Pult WoBinIch

A small Node.js utility that reminds you which office room and desk you’re assigned to today, and posts a visual floor plan to Slack. It talks to the Pult GraphQL API, draws a floor plan (with walls, desks, avatars, and a legend), and uploads the image with a brief status message.

## Features

- Fetches your current desk/office assignment from Pult
- Renders a floor plan image with:
  - Walls and labeled areas from Pult
  - All desks with reserved/available/disabled states
  - Coworker avatars (cached locally) or initials
  - Highlight for a target room based on the assigned desk
- Posts the generated image to Slack (as a file upload)
- Supports secure manual JWT refresh via a local auth helper web server
- Lets you map desk coordinates to friendly room names via `room-definition.md`

## Prerequisites

- Node.js 18+
- A Pult account and initial JWT token
- A Slack bot token with permission to upload files
- System libraries for node-canvas (Linux/Raspberry Pi):
  - Debian/Ubuntu: `sudo apt-get install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev librsvg2-dev`

## Environment variables

Create a `.env` file in the project root with at least the following:

```
# Pult
AUTH_TOKEN=your-initial-pult-jwt
PULT_LOGIN_EMAIL=you@yourcompany.com
# Optional: comma-separated list of target users to highlight (First Last)
TARGET_USERS=Alice Smith,Bob Jones

# Slack
SLACK_BOT_TOKEN=xoxb-...
# Optional: channel name or ID (defaults to "android-dev")
SLACK_CHANNEL=android-dev
# Required for token-expiry DM alerts (your Slack user ID, e.g. U123ABC)
SLACK_DM_USER_ID=U123ABC

# Local auth helper server (manual mode)
AUTH_SERVER_PORT=8787
# Optional bind host (default is all interfaces)
# AUTH_SERVER_BIND_HOST=0.0.0.0
# For localhost-only mode, set:
# AUTH_SERVER_BIND_HOST=127.0.0.1
# Optional public/LAN URL used in Slack alerts
# AUTH_SERVER_BASE_URL=http://192.168.1.10:8787

# Optional manual-refresh behavior tuning
# AUTH_SERVER_AUTOSTART=true
# TOKEN_REFRESH_WAIT_MS=1800000
# TOKEN_REFRESH_POLL_MS=2000
```

Notes:

- On JWT expiry, the app auto-starts the auth helper server if it is not reachable already.
- You can also run the helper manually with `npm run auth-server`.

### Configuration notes

- `PULT_LOGIN_EMAIL` is used to request the Pult magic-link email.
- `TARGET_USERS` defines which desks/room to highlight on the floor plan (match by first and last name, case-insensitive). If omitted, a small built-in default list is used.

## Setup

```
npm install
```

Fonts (optional but recommended): the script tries to load Gilmer fonts from `fonts/`:

- `fonts/gilmer-regular.ttf`
- `fonts/gilmer-medium.ttf`
- `fonts/gilmer-bold.ttf`

If these are not present, it will fall back to system fonts.

## Usage

```
npm start
```

This will:

1. Query Pult for today’s assignment(s)
2. Render `office-layout.png`
3. Upload the image to Slack with a short message

If the Pult JWT is expired (manual mode), the script sends a direct Slack alert with auth helper links.

### Manual token refresh web helper (recommended)

Run:

```
npm run auth-server
```

Then use either browser or API:

- `GET /` - simple web UI with forms
- `POST /request-magic-link` - asks Pult to send your magic-link email
- `POST /submit-magic-link` - body with `magicLink` (full URL from `https://app.pult.com/...`) to exchange and store `AUTH_TOKEN`
- `GET /health` - health check

Example API calls:

```
curl -X POST http://127.0.0.1:8787/request-magic-link
curl -X POST http://127.0.0.1:8787/submit-magic-link \
  -H "Content-Type: application/json" \
  -d '{"magicLink":"https://app.pult.com/login/magic-link/..."}'
```

Security notes:

- By default, the auth helper binds to all interfaces (`0.0.0.0`) so it can be reached via local/LAN/Tailscale IPs.
- If you want localhost-only access, set `AUTH_SERVER_BIND_HOST=127.0.0.1`.
- Magic links are strictly validated and only accepted from `https://app.pult.com/login/magic-link/...`.

## Mapping rooms: `room-definition.md`

Use this file to map grid coordinates (x, y) to human-friendly room names used in the Slack message.

Format:

```
Room Name A
12, 5
12, 6

Room Name B
20, 3
21, 3
```

Each room starts with its name on a line by itself, followed by any number of `x, y` coordinate lines.

## How token refresh works and why

- Why: Pult uses an email-based magic-link login; there’s no password/client-credentials flow.
- How:
  - The app sends you a Slack DM when the JWT expires
  - Use the local auth helper (`npm run auth-server`) to request and submit the magic-link
  - The helper exchanges the UUID for a fresh JWT and writes it back to `.env`
- The main app waits for the updated token and then continues automatically

Important: Set `PULT_LOGIN_EMAIL` in `.env` to the same address you use to log into Pult.

## Slack delivery

- Requires `SLACK_BOT_TOKEN` with permissions to upload files (e.g., `files:write`).
- Uses `SLACK_CHANNEL` (name or ID). If not set, defaults to `android-dev`.
- Uploads `office-layout.png` with your status as the initial comment.
- For token-expiry alerts in manual mode, set `SLACK_DM_USER_ID` (target user ID for direct messages).

## Folder structure

```
.
├─ src/
│  ├─ auth/
│  │  ├─ refresh.js
│  │  └─ server.js
│  ├─ config/
│  │  └─ index.js
│  ├─ layout/
│  │  └─ draw.js
│  ├─ pult/
│  │  └─ api.js
│  ├─ rooms/
│  │  └─ rooms.js
│  └─ slack/
│     └─ client.js
├─ activity.log
├─ auth-server.js
├─ fonts/
├─ index.js
├─ layout-history/
│  └─ avatars/           # cached coworker avatars
├─ LICENSE
├─ package.json
├─ package-lock.json
├─ README.md
└─ room-definition.md
```

The script writes:

- `office-layout.png` in the project root (latest run)
- `layout-history/office-layout-YYYY-MM-DD.png` archived copies
- `layout-history/avatars/*.png` cached avatar images

## Troubleshooting

- node-canvas build errors: ensure the system libraries listed under Prerequisites are installed.
- Missing token-expiry DM: set `SLACK_DM_USER_ID` to your Slack user ID and verify bot permissions for DMs.
- Auth helper URL not reachable: set `AUTH_SERVER_BASE_URL` to a LAN-reachable URL if you run on NAS/RPi.
- Slack upload issues: verify `SLACK_BOT_TOKEN` scopes and that the bot is a member of the target channel.

## License

Unlicense / Public Domain (see `LICENSE`).

## Development

- Lint code:

```
npm run lint
```

- Format code:

```
npm run format
```
