const express = require('express');
const db = require('../config/middleware/database');
const { getSitemapUrls } = require('../config/utils/seoPageService');
const { generateSitemap,getSitemapInfo } = require('../config/utils/sitemapGenerator');
const slugify = require('../config/utils/slugify');
const Ranking = require('../models/Ranking');
const { authenticate, requireSuperAdmin } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();
router.use(require('./seoIntelligenceRoutes'));

router.get('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { ACTIVE_PROPERTY_FILTER } = require('../config/utils/seoPageService');
    const [sitemapUrls, result] = await Promise.all([getSitemapUrls(), db.query(`SELECT s.id,s.state_name,COUNT(p.id)::int AS property_count FROM states s LEFT JOIN properties p ON p.state_id=s.id AND ${ACTIVE_PROPERTY_FILTER} GROUP BY s.id,s.state_name ORDER BY s.state_name`)]);
    const count = pattern => sitemapUrls.filter(url => pattern.test(new URL(url).pathname)).length;
    const stateBreakdown = result.rows.map(row => ({...row,state_slug:slugify(row.state_name)}));
    res.json({success:true,summary:{statePages:count(/^\/nigeria\/[^/]+$/),lgaPages:count(/^\/nigeria\/[^/]+\/[^/]+$/),areaPages:count(/^\/areas\//),propertyPages:count(/^\/properties\/\d+$/),sitemapUrls:sitemapUrls.length,totalSeoPages:sitemapUrls.length,statesWithPages:stateBreakdown.filter(s=>s.property_count>0).length,statesWithNoProperties:stateBreakdown.filter(s=>!s.property_count).length},stateBreakdown});
  } catch(error) {req.logger.error('SEO summary unavailable',{code:error.code});res.status(503).json({success:false,message:'SEO inventory is unavailable. Check the database and try again.'});}
});

router.get('/rankings', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    if (Ranking.db.readyState !== 1) return res.status(503).json({success:false,code:'RANKING_STORAGE_UNAVAILABLE',message:'Ranking history storage is unavailable. No result can be confirmed.'});
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const keyword = String(req.query.keyword || '').trim();
    // Exclude legacy records created by the old random-number generator.
    // Cast to string to prevent NoSQL injection via $regex/$where operators
    const filter = keyword
      ? { keyword: String(keyword), source: 'serpapi' }
      : { source: 'serpapi' };
    const rankings = await Ranking.find(filter)
      .sort({ checkedAt: -1 })
      .limit(limit)
      .lean();

    const latestByKeyword = [];
    const seenKeywords = new Set();
    for (const ranking of rankings) {
      const key = [ranking.keywordId||ranking.keyword,ranking.searchCountry,ranking.searchLanguage,ranking.searchLocation||'',ranking.url].join('|');
      if (!seenKeywords.has(key)) {
        seenKeywords.add(key);
        const previous=rankings.find(other=>other!==ranking&&[other.keywordId||other.keyword,other.searchCountry,other.searchLanguage,other.searchLocation||'',other.url].join('|')===key);
        ranking.previousPosition=previous?.position??null;
        ranking.movement=ranking.position!=null&&previous?.position!=null?previous.position-ranking.position:null;
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
    req.logger.error('SEO ranking history error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to load SEO ranking history',
    });
  }
});

router.post('/rankings/check', authenticate, requireSuperAdmin, validateRequest, async (req, res) => {
  try {
    const queued = await require('../services/seo').keywords.queueChecks(req.user);
    return res.json({success:true,data:queued,message:queued.message});
  } catch (error) {
    req.logger.error('Manual SEO ranking check error:', error.message);
    res.status(502).json({
      success: false,
      message: error.message || 'Failed to check SEO rankings',
    });
  }
});

router.post('/regenerate-sitemap', authenticate, requireSuperAdmin, validateRequest, async (req, res) => {
  try {
    const xml = await generateSitemap({ force: true });
    const {urlCount} = await getSitemapInfo();
    res.json({ success: true, data: { urlCount, generatedAt: new Date().toISOString() } });
  } catch (error) {
    req.logger.error('Sitemap regenerate error:', error);
    res.status(500).json({ success: false, message: 'Failed to regenerate sitemap' });
  }
});

router.get('/sitemap-xml', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const xml = await generateSitemap();
    res.json({ success: true, data: { xml, generatedAt: new Date().toISOString() } });
  } catch (error) {
    req.logger.error('Sitemap fetch error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch sitemap' });
  }
});

router.post('/ping-google', authenticate, requireSuperAdmin, validateRequest, async (req, res) => {
  try {
    res.status(410).json({ success: false, code: 'USE_SEARCH_CONSOLE', message: 'Ordinary pages cannot use the Google Indexing API. Connect Search Console and submit the sitemap instead.' });
  } catch (error) {
    req.logger.error('Ping Google error:', error);
    res.status(500).json({ success: false, message: 'Failed to ping Google' });
  }
});

module.exports = router;
