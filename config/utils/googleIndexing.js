const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DEFAULT_SERVICE_ACCOUNT_FILE = 'service-account.json';

const resolveKeyFile = () => {
  const configuredPath =
    process.env.GOOGLE_INDEXING_KEY_FILE ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
    DEFAULT_SERVICE_ACCOUNT_FILE;

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
};

const getIndexingClient = async () => {
  const jsonString =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_INDEXING_CREDENTIALS ||
    process.env.GOOGLE_CREDENTIALS_JSON;

  let credentials = null;
  if (jsonString) {
    try {
      credentials = typeof jsonString === 'object' ? jsonString : JSON.parse(jsonString);
    } catch {
      try {
        const decoded = Buffer.from(jsonString, 'base64').toString('utf8');
        credentials = JSON.parse(decoded);
      } catch {
        /* fallback to file */
      }
    }
  }

  const keyFile = resolveKeyFile();

  if (!credentials && !keyFile) {
    return null;
  }

  const authOptions = {
    scopes: ['https://www.googleapis.com/auth/indexing'],
  };
  if (credentials) {
    authOptions.credentials = credentials;
  } else if (keyFile) {
    authOptions.keyFile = keyFile;
  }

  const auth = new google.auth.GoogleAuth(authOptions);
  const client = await auth.getClient();

  return google.indexing({
    version: 'v3',
    auth: client,
  });
};

const submitUrl = async (url, type = 'URL_UPDATED') => {
  if (!url) {
    return { success: false, skipped: true, reason: 'missing_url' };
  }

  const indexing = await getIndexingClient();
  if (!indexing) {
    return { success: false, skipped: true, reason: 'missing_service_account' };
  }

  await indexing.urlNotifications.publish({
    requestBody: {
      url,
      type,
    },
  });

  return { success: true, skipped: false, url };
};

const submitUrls = async (urls = [], type = 'URL_UPDATED') => {
  const uniqueUrls = Array.from(
    new Set(
      (Array.isArray(urls) ? urls : [])
        .map((url) => String(url || '').trim())
        .filter(Boolean)
    )
  );

  if (uniqueUrls.length === 0) {
    return [];
  }

  const results = [];
  for (const url of uniqueUrls) {
    try {
      results.push(await submitUrl(url, type));
    } catch (error) {
      results.push({
        success: false,
        skipped: false,
        url,
        error: error.message,
      });
    }
  }

  return results;
};

module.exports = {
  submitURL: submitUrl,
  submitUrl,
  submitUrls,
};
