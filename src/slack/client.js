const { WebClient } = require('@slack/web-api');
const { SLACK_BOT_TOKEN, SLACK_CHANNEL, SLACK_DM_USER_ID, DRY_RUN } = require('../config');
const fs = require('fs').promises;
const path = require('path');
const https = require('https');

const slack = new WebClient(SLACK_BOT_TOKEN);

async function uploadFileToSlack(imagePath, message) {
  const filePath = path.join(process.cwd(), imagePath);
  const filename = path.basename(imagePath);
  const fileBuffer = await fs.readFile(filePath);

  // Step 1: Get upload URL
  const uploadUrlResponse = await slack.files.getUploadURLExternal({
    filename: filename,
    length: fileBuffer.length,
  });

  if (!uploadUrlResponse.ok) {
    throw new Error(`Failed to get upload URL: ${uploadUrlResponse.error}`);
  }

  const { upload_url, file_id } = uploadUrlResponse;

  // Step 2: Upload file to the external URL
  await uploadFileToExternalUrl(upload_url, fileBuffer);

  // Step 3: Complete the upload
  const completeResponse = await slack.files.completeUploadExternal({
    files: [
      {
        id: file_id,
        title: filename,
      },
    ],
    channel_id: SLACK_CHANNEL,
    initial_comment: message,
  });

  if (!completeResponse.ok) {
    throw new Error(`Failed to complete upload: ${completeResponse.error}`);
  }
}

async function uploadFileToExternalUrl(uploadUrl, fileBuffer) {
  return new Promise((resolve, reject) => {
    const url = new URL(uploadUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(fileBuffer);
    req.end();
  });
}

async function sendSlackDirectMessage(message) {
  try {
    if (!SLACK_DM_USER_ID) {
      console.warn(
        'SLACK_DM_USER_ID is not set. Cannot send DM alert. Set it to your Slack user ID (e.g., U123...).',
      );
      return false;
    }
    if (DRY_RUN) {
      console.log('[DRY_RUN] Skipping Slack DM. Message would be:');
      console.log(message);
      return true;
    }
    const openResponse = await slack.conversations.open({ users: SLACK_DM_USER_ID });
    const dmChannelId = openResponse?.channel?.id;
    if (!dmChannelId) {
      throw new Error('Could not open DM channel');
    }
    const postResponse = await slack.chat.postMessage({
      channel: dmChannelId,
      text: message,
    });
    if (!postResponse.ok) {
      throw new Error(`Failed to send DM: ${postResponse.error}`);
    }
    return true;
  } catch (error) {
    console.error('Error sending Slack DM:', error.message);
    return false;
  }
}

async function sendSlackMessage(message, imagePath) {
  try {
    if (DRY_RUN) {
      console.log('[DRY_RUN] Skipping Slack upload. Message would be:');
      console.log(message);
      if (imagePath) {
        console.log(`[DRY_RUN] Would upload image: ${imagePath}`);
      }
      return;
    }
    if (imagePath) {
      try {
        await uploadFileToSlack(imagePath, message);
        return;
      } catch (uploadError) {
        console.error('Error uploading image:', uploadError.message);
      }
    }

    // Fallback: text-only (commented out in original - left here for completeness)
    // await slack.chat.postMessage({ channel: SLACK_CHANNEL, text: message });
  } catch (error) {
    console.error('Error sending Slack message:', error.message);
  }
}

module.exports = { sendSlackMessage, sendSlackDirectMessage, __internals: { slack } };
