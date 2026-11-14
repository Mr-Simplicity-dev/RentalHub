const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  authenticate,
  requireSuperAdmin
} = require('../config/middleware/auth');
const {
  fail,
  range
} = require('../services/seo/core');
const service = require('../services/seo');
const router = express.Router();
const wrap = fn => async (req, res) => {
  try {
    const data = await fn(req, res);
    if (!res.headersSent) res.json({
      success: true,
      data
    });
  } catch (e) {
    req.logger?.warn('SEO request failed', {
      code: e.code || 'SEO_REQUEST_FAILED'
    });
    if (!res.headersSent) res.status(e.status >= 400 && e.status <= 599 ? e.status : 503).json({
      success: false,
      code: e.code || 'SEO_REQUEST_FAILED',
      message: e.status ? e.message : 'SEO data is unavailable. Please try again later.'
    });
  }
};
// OAuth state is single-use, expires, and checks the original Super Admin session version.
router.get('/google/callback', rateLimit({
  windowMs: 60000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  try {
    const result = await service.google.callback(req.query);
    res.redirect(303, result.returnUrl);
  } catch {
    res.redirect(303, require('../config/utils/frontendUrl').getFrontendUrl() + '/super-admin/seo?google=connection-failed');
  }
});
router.use((req, res, next) => {
  const prefixes = ['/google', '/integrations', '/search-console', '/keywords', '/competitors', '/trends', '/opportunities', '/content-plans', '/technical-audit', '/pagespeed', '/observations', '/settings', '/export', '/rankings/queue'];
  if (!prefixes.some(prefix => req.path === prefix || req.path.startsWith(prefix + '/'))) return next('router');
  next();
});
router.use(authenticate, requireSuperAdmin);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
const mutation = rateLimit({
  windowMs: 60000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Please wait before sending more SEO requests.'
  }
});
const uuid = value => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value))) fail(400, 'INVALID_ID', 'Choose a valid record.');
  return value;
};
router.get('/integrations', wrap(() => service.google.status()));
router.post('/google/:provider/connect', mutation, wrap(req => service.google.start(req.params.provider, req.user, {
  sitemapWrite: req.body.sitemap_write === true
})));
router.post('/google/:provider/disconnect', mutation, wrap(req => service.google.disconnect(req.params.provider, req.user)));
router.get('/search-console/sites', wrap(() => service.search.sites()));
router.post('/search-console/property', mutation, wrap(req => service.search.selectProperty(req.body.siteUrl, req.user)));
router.get('/search-console/performance', wrap(req => service.search.performance(req.query)));
router.get('/search-console/syncs', wrap(() => service.search.runs()));
router.post('/search-console/sync', mutation, wrap(req => service.search.enqueue(req.body, req.user)));
router.post('/search-console/inspect', mutation, wrap(req => service.search.inspect(req.body.url, req.user)));
router.post('/search-console/submit-sitemap', mutation, wrap(req => service.search.submitSitemap(req.user)));
router.post('/keywords/import-configured', mutation, wrap(req => service.keywords.importConfigured(req.user)));
router.post('/keywords/research', mutation, wrap(req => service.keywords.research(req.body, req.user)));
router.get('/keywords', wrap(req => service.keywords.list(req.query)));
router.post('/keywords', mutation, wrap(req => {
  if (req.body.research_id) uuid(req.body.research_id);
  return service.keywords.save(req.body, req.user);
}));
router.delete('/keywords/:id', mutation, wrap(req => {
  if (!/^\d{1,16}$/.test(req.params.id)) fail(400, 'INVALID_ID', 'Choose a valid keyword.');
  return service.keywords.remove(req.params.id, req.user);
}));
router.post('/rankings/queue', mutation, wrap(req => service.keywords.queueChecks(req.user)));
router.get('/competitors', wrap(() => service.keywords.competitors()));
router.post('/competitors', mutation, wrap(req => service.keywords.saveCompetitor(req.body, req.user)));
router.delete('/competitors/:domain', mutation, wrap(req => service.keywords.removeCompetitor(req.params.domain)));
router.post('/trends', wrap(req => service.keywords.trends(req.body.seeds)));
router.get('/opportunities', wrap(req => service.intelligence.list(req.query)));
router.post('/opportunities/generate', mutation, wrap(req => service.intelligence.generate(req.body, req.user)));
router.patch('/opportunities/:id', mutation, wrap(req => {
  if (!/^[a-f0-9]{64}$/.test(req.params.id)) fail(400, 'INVALID_ID', 'Choose a valid opportunity.');
  return service.intelligence.update(req.params.id, req.body.status, req.user);
}));
router.get('/content-plans', wrap(() => service.content.list()));
router.get('/content-plans/legacy-drafts', wrap(() => service.content.legacyDrafts()));
router.post('/content-plans/import', mutation, wrap(req => service.content.importDraft(req.body, req.user)));
router.get('/content-plans/suggestions', wrap(() => service.content.suggestions()));
router.post('/content-plans', mutation, wrap(req => {
  if (req.body.id) uuid(req.body.id);
  return service.content.save(req.body, req.user);
}));
router.post('/content-plans/:id/publish', mutation, wrap(req => service.content.publish({
  ...req.body,
  id: uuid(req.params.id)
}, req.user)));
router.post('/technical-audit', mutation, wrap(req => service.technical.run(req.body, req.user)));
router.post('/pagespeed', mutation, wrap(req => service.technical.pagespeed(req.body, req.user)));
router.get('/observations', wrap(async req => {
  const kinds = ['keyword_research', 'url_inspection', 'technical_audit', 'sitemap', 'pagespeed'];
  if (!kinds.includes(req.query.kind)) fail(400, 'INVALID_HISTORY_TYPE', 'Choose a report type.');
  return (await service.store.query('SELECT id,kind,subject,status,result,error_code,created_at FROM seo_observations WHERE kind=$1 ORDER BY created_at DESC LIMIT 30', [req.query.kind])).rows;
}));
router.get('/settings', wrap(async () => ({
  config: await service.store.settings(),
  usage: (await service.store.query('SELECT provider,usage_date,used FROM seo_provider_usage WHERE usage_date=CURRENT_DATE ORDER BY provider')).rows
})));
router.put('/settings', mutation, wrap(async req => {
  const limits = {
      serp_daily_limit: [0, 100],
      serp_batch_size: [1, 10],
      ranking_max_keywords: [1, 1000],
      low_ctr: [0.001, 0.2],
      min_impressions: [10, 10000],
      loss_ratio: [0.05, 0.9],
      sync_days: [1, 90]
    },
    config = {};
  for (const [key, [min, max]] of Object.entries(limits)) {
    const n = Number(req.body[key]);
    if (!Number.isFinite(n) || n < min || n > max || !['low_ctr', 'loss_ratio'].includes(key) && !Number.isInteger(n)) fail(400, 'INVALID_SEO_SETTING', `Check the ${key} value.`);
    config[key] = n;
  }
  await service.store.query('UPDATE seo_settings SET config=$1::jsonb,updated_by=$2,updated_at=NOW() WHERE id=1', [JSON.stringify(config), req.user.id]);
  await require('../config/utils/auditLogger').logAction({
    actorId: req.user.id,
    action: 'SEO_SETTINGS_UPDATED',
    targetType: 'seo'
  });
  return config;
}));
router.get('/export', wrap(async (req, res) => {
  const keywordExport = req.query.type === 'keywords';
  if (!keywordExport) range(req.query);
  const rows = keywordExport ? (await service.store.query("SELECT keyword,country,language,location,group_name,target_url,is_tracked,frequency_hours,metrics_source,metrics->>'average_monthly_searches' AS estimated_monthly_searches,metrics_updated_at,COUNT(*) OVER() AS total_count FROM seo_keywords WHERE is_active ORDER BY keyword,id LIMIT 10000")).rows : (await service.search.performance(req.query)).topQueries;
  const columns = keywordExport ? ['keyword', 'country', 'language', 'location', 'group_name', 'target_url', 'is_tracked', 'frequency_hours', 'metrics_source', 'estimated_monthly_searches', 'metrics_updated_at'] : ['label', 'clicks', 'impressions', 'ctr', 'position'];
  const escape = value => {
    let cell = String(value ?? '');
    if (/^\s*[=+@-]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replace(/"/g, '""') + '"';
  };
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="rentalhub-seo.csv"');
  res.set('X-SEO-Export-Limit', keywordExport ? '10000' : '100');
  res.set('X-SEO-Export-Truncated', String(keywordExport && Number(rows[0]?.total_count) > 10000));
  res.send('\uFEFF' + [columns.map(escape).join(','), ...rows.map(row => columns.map(c => escape(row[c])).join(','))].join('\r\n'));
}));
module.exports = router;
