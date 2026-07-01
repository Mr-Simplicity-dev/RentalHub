const express = require('express');
const { param } = require('express-validator');
const db = require('../config/middleware/database');
const nigeriaLocations = require('../data/nigeriaLocations');
const { getSitemapUrls } = require('../config/utils/seoPageService');
const { generateSitemap } = require('../config/utils/sitemapGenerator');
const { pingGoogle } = require('../config/utils/pingGoogle');
const Ranking = require('../models/Ranking');
const { runConfiguredRankingChecks } = require('../config/utils/rankChecker');
const { authenticate, requireAdminOrSuperAdmin } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

router.get('/', authenticate, requireAdminOrSuperAdmin, async (req, res) => {
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

router.get('/rankings', authenticate, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const keyword = String(req.query.keyword || '').trim();
    // Exclude legacy records created by the old random-number generator.
    const filter = keyword
      ? { keyword, source: 'serpapi' }
      : { source: 'serpapi' };
    const rankings = await Ranking.find(filter)
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    const latestByKeyword = [];
    const seenKeywords = new Set();
    for (const ranking of rankings) {
      if (!seenKeywords.has(ranking.keyword)) {
        seenKeywords.add(ranking.keyword);
        latestByKeyword.push(ranking);
      }
    }

    res.json({
      success: true,
      data: {
        latestByKeyword,
        history: rankings,
      },
    });
  } catch (error) {
    console.error('SEO ranking history error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to load SEO ranking history',
    });
  }
});

router.post('/rankings/check', authenticate, requireAdminOrSuperAdmin, validateRequest, async (req, res) => {
  try {
    const rankings = await runConfiguredRankingChecks();
    res.json({
      success: true,
      data: rankings,
      message: `Completed ${rankings.length} ranking check(s)`,
    });
  } catch (error) {
    console.error('Manual SEO ranking check error:', error.message);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to check SEO rankings',
    });
  }
});

router.post('/regenerate-sitemap', authenticate, requireAdminOrSuperAdmin, validateRequest, async (req, res) => {
  try {
    const sitemapUrls = await getSitemapUrls();
    const urlCount = sitemapUrls.length;
    res.json({ success: true, data: { urlCount, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Sitemap regenerate error:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate sitemap' });
  }
});

router.get('/sitemap-xml', authenticate, requireAdminOrSuperAdmin, async (req, res) => {
  try {
    const xml = await generateSitemap();
    res.json({ success: true, data: { xml, generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('Sitemap fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sitemap' });
  }
});

router.post('/ping-google', authenticate, requireAdminOrSuperAdmin, validateRequest, async (req, res) => {
  try {
    const result = await pingGoogle();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Ping Google error:', error);
    res.status(500).json({ success: false, message: 'Failed to ping Google' });
  }
});

module.exports = router;
