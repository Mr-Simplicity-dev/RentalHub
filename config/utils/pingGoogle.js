const axios = require('axios');
const { getFrontendUrl } = require('./frontendUrl');

exports.pingGoogle = async () => {
  const sitemapUrl = `${getFrontendUrl()}/sitemap.xml`;

  try {
    await axios.get(
      `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`
    );

    return {
      success: true,
      sitemapUrl,
    };
  } catch (error) {
    return {
      success: false,
      sitemapUrl,
      error: error.message,
    };
  }
};
