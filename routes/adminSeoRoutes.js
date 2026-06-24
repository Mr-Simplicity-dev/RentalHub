const express = require('express');
const db = require('../config/middleware/database');
const nigeriaLocations = require('../data/nigeriaLocations');
const { getSitemapUrls } = require('../config/utils/seoPageService');
const { generateSitemap } = require('../config/utils/sitemapGenerator');
const { pingGoogle } = require('../config/utils/pingGoogle');

const router = express.Router();

router.get('/admin/seo', async (req, res) => {
  try {
    const [propertyResult, stateResult, stateBreakdown, sitemapUrls] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::INT AS total
         FROM properties
         WHERE is_verified = TRUE
           AND COALESCE(is_available, TRUE) = TRUE`
      ),
      db.query(`SELECT COUNT(*)::INT AS total FROM states`),
      db.query(
        `SELECT
           s.id, s.state_name, s.state_slug,
           COALESCE(prop.property_count, 0)::INT AS property_count
         FROM states s
         LEFT JOIN (
           SELECT state_id, COUNT(*)::INT AS property_count
           FROM properties
           WHERE is_verified = TRUE AND COALESCE(is_available, TRUE) = TRUE
           GROUP BY state_id
         ) prop ON prop.state_id = s.id
         ORDER BY s.state_name ASC`
      ),
      getSitemapUrls(),
    ]);

    const totalLgas = nigeriaLocations.reduce(
      (total, state) => total + (Array.isArray(state.lgas) ? state.lgas.length : 0),
      0
    );

    const areaResult = await db.query(
      `SELECT COUNT(*)::INT AS total
       FROM (
         SELECT
           p.state_id,
           COALESCE(NULLIF(TRIM(p.city), ''), 'unknown') AS city_name,
           COALESCE(NULLIF(TRIM(p.area), ''), NULLIF(TRIM(p.city), ''), 'unknown') AS area_name
         FROM properties p
         WHERE p.is_verified = TRUE
           AND COALESCE(p.is_available, TRUE) = TRUE
         GROUP BY
           p.state_id,
           COALESCE(NULLIF(TRIM(p.city), ''), 'unknown'),
           COALESCE(NULLIF(TRIM(p.area), ''), NULLIF(TRIM(p.city), ''), 'unknown')
       ) areas`
    );

    const statePages = Number(stateResult.rows[0]?.total || 0);
    const areaPages = Number(areaResult.rows[0]?.total || 0);
    const propertyPages = Number(propertyResult.rows[0]?.total || 0);
    const totalSeoPages = statePages + totalLgas + areaPages + propertyPages;

    const statesWithPages = stateBreakdown.rows.filter(s => s.property_count > 0).length;
    const statesWithNoProperties = stateBreakdown.rows.filter(s => s.property_count === 0).length;

    res.json({
      success: true,
      summary: {
        statePages,
        lgaPages: totalLgas,
        areaPages,
        propertyPages,
        sitemapUrls: sitemapUrls.length,
        totalSeoPages,
        statesWithPages,
        statesWithNoProperties,
      },
      stateBreakdown: stateBreakdown.rows,
    });
  } catch (error) {
    console.error('SEO summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load SEO summary',
    });
  }
});

router.post('/admin/seo/regenerate-sitemap', async (req, res) => {
  try {
    const sitemapUrls = await getSitemapUrls();
    const urlCount = sitemapUrls.length;
    res.json({ success: true, data: { urlCount, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Sitemap regenerate error:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate sitemap' });
  }
});

router.get('/admin/seo/sitemap-xml', async (req, res) => {
  try {
    const xml = await generateSitemap();
    res.json({ success: true, data: { xml, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Sitemap fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sitemap' });
  }
});

router.post('/admin/seo/ping-google', async (req, res) => {
  try {
    const result = await pingGoogle();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Ping Google error:', error);
    res.status(500).json({ success: false, message: 'Failed to ping Google' });
  }
});

module.exports = router;
