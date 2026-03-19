const { google } = require("googleapis");

exports.submitURL = async (url) => {
  const auth = new google.auth.GoogleAuth({
    keyFile: "service-account.json",
    scopes: ["https://www.googleapis.com/auth/indexing"]
  });

  const client = await auth.getClient();

  const indexing = google.indexing({
    version: "v3",
    auth: client
  });

  await indexing.urlNotifications.publish({
    requestBody: {
      url,
      type: "URL_UPDATED"
    }
  });

  console.log("Submitted to Google:", url);
};