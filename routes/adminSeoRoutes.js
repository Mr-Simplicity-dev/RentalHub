const express = require('express');
const db = require('../config/middleware/database');
const nigeriaLocations = require('../data/nigeriaLocations');
const { getSitemapUrls } = require('../config/utils/seoPageService');

const router = express.Router();

router.get('/admin/seo', async (req, res) => {
  try {
    const [propertyResult, stateResult, sitemapUrls] = await Promise.all([
      db.query(
        `SELECT COUNT(*)::INT AS total
         FROM properties
         WHERE is_verified = TRUE
           AND COALESCE(is_available, TRUE) = TRUE`
      ),
      db.query(`SELECT COUNT(*)::INT AS total FROM states`),
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

    res.json({
      success: true,
      totalBlogs: 0,
      rankings: [],
      summary: {
        statePages: Number(stateResult.rows[0]?.total || 0),
        lgaPages: totalLgas,
        areaPages: Number(areaResult.rows[0]?.total || 0),
        propertyPages: Number(propertyResult.rows[0]?.total || 0),
        sitemapUrls: sitemapUrls.length,
      },
    });
  } catch (error) {
    console.error('SEO summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load SEO summary',
    });
  }
});

module.exports = router;
