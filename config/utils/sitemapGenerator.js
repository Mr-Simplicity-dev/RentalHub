const { getSitemapUrls } = require('./seoPageService');

const formatSitemapDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

exports.generateSitemap = async () => {
  const urls = await getSitemapUrls();
  const lastmod = formatSitemapDate(new Date());

  const urlEntries = urls
    .map(
      (url) => `
    <url>
      <loc>${url}</loc>
      ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    </url>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urlEntries}
  </urlset>`;
};
