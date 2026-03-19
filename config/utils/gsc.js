const { google } = require("googleapis");

exports.getSearchData = async () => {
  const auth = new google.auth.GoogleAuth({
    keyFile: "service-account.json",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"]
  });

  const client = await auth.getClient();

  const webmasters = google.webmasters({
    version: "v3",
    auth: client
  });

  const res = await webmasters.searchanalytics.query({
    siteUrl: "https://rentalhub.com.ng",
    requestBody: {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      dimensions: ["query"],
    }
  });

  return res.data;
};