const runtime = require('../services/backgroundJobRuntime');
const {
  shiftDay
} = require('../services/seo/core');
let started = false;
exports.startSeoJobs = () => {
  if (started) return;
  started = true;
  const service = require('../services/seo');
  const guarded = fn => async () => {
    try {
      return await fn();
    } catch (e) {
      if (['SEO_MIGRATION_REQUIRED', 'SEO_DATABASE_UNAVAILABLE', 'GOOGLE_NOT_CONNECTED', 'PROPERTY_ACCESS_REQUIRED'].includes(e.code)) return {
        skipped: true,
        reason: e.code
      };
      throw e;
    }
  };
  runtime.cron.schedule('15 4 * * *', guarded(async () => {
    const c = await service.google.connection('search_console');
    if (c?.status !== 'connected' || !c.property_url) return {
      skipped: true,
      reason: 'SEARCH_CONSOLE_NOT_CONNECTED'
    };
    const end = shiftDay(new Date().toISOString().slice(0, 10), -3),
      days = c.last_sync_at ? 7 : Number((await service.store.settings()).sync_days || 28);
    return service.search.enqueue({
      start: shiftDay(end, -days + 1),
      end
    });
  }), {
    name: 'seo-search-console-daily'
  });
  runtime.cron.schedule('*/2 * * * *', guarded(() => service.search.work()), {
    name: 'seo-search-console-worker'
  });
  runtime.cron.schedule('*/10 * * * *', guarded(() => require('../config/utils/rankChecker').runManagedRankingChecks({
    store: service.store
  })), {
    name: 'seo-managed-ranking-checks'
  });
  runtime.cron.schedule('30 5 * * 1', guarded(async () => {
    const xml = await require('../config/utils/sitemapGenerator').generateSitemap({
      force: true
    });
    return service.store.observe('sitemap', '/sitemap.xml', {
      source: 'local_validation',
      urlCount: (await require('../config/utils/sitemapGenerator').getSitemapInfo()).urlCount,
      checked_at: new Date().toISOString(),
      google_accepted: false,
      indexing_confirmed: false
    });
  }), {
    name: 'seo-sitemap-weekly-validation'
  });
};
