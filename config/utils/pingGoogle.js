const axios = require("axios");

exports.pingGoogle = async () => {
  const sitemapUrl = "https://rentalhub.com.ng/sitemap.xml";

  try {
    await axios.get(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
    );

    console.log("✅ Sitemap submitted to Google");
  } catch (err) {
    console.error("❌ Failed to ping Google");
  }
};