const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
const { getFrontendUrl } = require("./frontendUrl");

const DEFAULT_SERVICE_ACCOUNT_FILE = "service-account.json";

const resolveKeyFile = () => {
  const configuredPath =
    process.env.GSC_KEY_FILE ||
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE ||
    process.env.GOOGLE_INDEXING_KEY_FILE ||
    DEFAULT_SERVICE_ACCOUNT_FILE;

  const absolutePath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(process.cwd(), configuredPath);

  return fs.existsSync(absolutePath) ? absolutePath : null;
};

const getConfiguredSiteUrl = () =>
  String(process.env.GSC_SITE_URL || getFrontendUrl()).trim();

const getConfiguredDateRange = () => {
  const currentYear = new Date().getFullYear();
  const startDate = String(
    process.env.GSC_START_DATE || `${currentYear}-01-01`
  ).trim();
  const endDate = String(
    process.env.GSC_END_DATE || new Date().toISOString().slice(0, 10)
  ).trim();

  return { startDate, endDate };
};

exports.getSearchData = async () => {
  const keyFile = resolveKeyFile();

  if (!keyFile) {
    throw new Error("GSC service account key file is not configured");
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  const client = await auth.getClient();

  const webmasters = google.webmasters({
    version: "v3",
    auth: client,
  });

  const { startDate, endDate } = getConfiguredDateRange();

  const res = await webmasters.searchanalytics.query({
    siteUrl: getConfiguredSiteUrl(),
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query"],
    },
  });

  return res.data;
};
