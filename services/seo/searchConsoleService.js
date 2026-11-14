const {
  fail,
  text,
  hash,
  id,
  range,
  shiftDay,
  canonicalUrl
} = require('./core');
function createSearchConsole({
  store,
  google,
  frontend = () => require('../../config/utils/frontendUrl').getFrontendUrl(),
  audit = async () => {}
}) {
  const ownSite = site => {
    try {
      const origin = new URL(frontend());
      if (site === 'sc-domain:' + origin.hostname) return true;
      const u = new URL(site);
      return u.origin === origin.origin && u.pathname === '/' && !u.search && !u.hash;
    } catch {
      return false;
    }
  };
  const sites = async () => {
    const r = await google.request('search_console', {
      method: 'GET',
      url: 'https://www.googleapis.com/webmasters/v3/sites'
    });
    return (r.data.siteEntry || []).filter(s => ownSite(s.siteUrl) && s.permissionLevel !== 'siteUnverifiedUser');
  };
  const selectProperty = async (siteUrl, actor) => {
    const available = await sites();
    if (!available.some(s => s.siteUrl === siteUrl)) fail(400, 'PROPERTY_ACCESS_REQUIRED', 'Verify the RentalHub property in Search Console and grant this Google account access.');
    await store.transaction(async tx => {
      await tx.query("UPDATE seo_integrations SET property_url=$1,version=version+1,updated_at=NOW() WHERE provider='search_console'", [siteUrl]);
      await tx.query("UPDATE seo_sync_runs SET status='cancelled',completed_at=NOW() WHERE provider='search_console' AND status IN ('queued','running','retry')");
    });
    await audit({
      actorId: actor.id,
      action: 'SEO_SEARCH_PROPERTY_SELECTED',
      targetType: 'search_console'
    });
    return {
      property_url: siteUrl
    };
  };
  const connected = async () => {
    const c = await google.connection('search_console');
    if (c?.status !== 'connected') fail(409, 'GOOGLE_NOT_CONNECTED', 'Connect Search Console first.');
    if (!c.property_url || !ownSite(c.property_url)) fail(409, 'PROPERTY_ACCESS_REQUIRED', 'Select your verified RentalHub property first.');
    return c;
  };
  const enqueue = async (input = {}, actor = {}) => {
    const c = await connected(),
      period = range(input);
    if (period.start < shiftDay(new Date().toISOString().slice(0, 10), -480)) fail(400, 'SEARCH_HISTORY_EXPIRED', 'Choose dates within Search Console retention.');
    const result = await store.query("INSERT INTO seo_sync_runs(id,provider,connection_version,property_url,start_date,end_date,cursor_date,status,requested_by) VALUES($1,'search_console',$2,$3,$4,$5,$4,'queued',$6) ON CONFLICT(provider) WHERE status IN ('queued','running','retry') DO NOTHING RETURNING id,status,start_date,end_date", [id(), c.version, c.property_url, period.start, period.end, actor.id || null]);
    const row = result.rows[0] || (await store.query("SELECT id,status,start_date,end_date FROM seo_sync_runs WHERE provider='search_console' AND status IN ('queued','running','retry')")).rows[0];
    await audit({
      actorId: actor.id,
      action: 'SEO_SEARCH_SYNC_REQUESTED',
      targetType: 'search_console'
    });
    return {
      run: row,
      already_queued: !result.rows.length
    };
  };
  const fetchDay = async (site, date, kind) => {
    const rows = [];
    let truncated = false;
    for (let startRow = 0; startRow < 50000; startRow += 25000) {
      await store.reserve('search_console_analytics', 1000);
      const r = await google.request('search_console', {
        method: 'POST',
        url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
        data: {
          startDate: date,
          endDate: date,
          dimensions: kind === 'total' ? ['date'] : ['query', 'page', 'country', 'device'],
          type: 'web',
          dataState: 'final',
          ...(kind === 'total' ? {
            aggregationType: 'byProperty'
          } : {}),
          rowLimit: 25000,
          startRow
        }
      });
      if (!Array.isArray(r.data.rows) && r.data.rows !== undefined) fail(502, 'GOOGLE_INVALID_DATA', 'Google returned an invalid performance response.');
      const batch = r.data.rows || [];
      for (const row of batch) {
        if (!Number.isFinite(Number(row.clicks)) || !Number.isFinite(Number(row.impressions)) || Number(row.clicks) < 0 || Number(row.impressions) < 0 || !Number.isFinite(Number(row.position)) || Number(row.position) < 0) fail(502, 'GOOGLE_INVALID_DATA', 'Google returned incomplete performance metrics.');
        if (kind === 'total' && (!Array.isArray(row.keys) || row.keys.length !== 1 || row.keys[0] !== date) || kind === 'detail' && (!Array.isArray(row.keys) || row.keys.length !== 4)) fail(502, 'GOOGLE_INVALID_DATA', 'Google returned invalid search dimensions.');
        rows.push({
          query: kind === 'detail' ? String(row.keys[0]) : '',
          page: kind === 'detail' ? String(row.keys[1]) : '',
          country: kind === 'detail' ? String(row.keys[2]).toLowerCase() : '',
          device: kind === 'detail' ? String(row.keys[3]).toLowerCase() : '',
          clicks: Number(row.clicks),
          impressions: Number(row.impressions),
          position: Number(row.position)
        });
      }
      if (batch.length < 25000) break;
      if (startRow === 25000) truncated = true;
    }
    return {
      rows,
      truncated
    };
  };
  const work = async () => {
    const lease = id(),
      run = (await store.query("UPDATE seo_sync_runs SET status='running',lease_id=$1,heartbeat_at=NOW() WHERE id=(SELECT id FROM seo_sync_runs WHERE provider='search_console' AND next_attempt_at<=NOW() AND (status IN ('queued','retry') OR (status='running' AND heartbeat_at<NOW()-INTERVAL '10 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *", [lease])).rows[0];
    if (!run) return {
      skipped: true,
      reason: 'NO_PENDING_SEARCH_SYNC'
    };
    try {
      const c = await connected();
      if (c.version !== run.connection_version || c.property_url !== run.property_url) {
        await store.query("UPDATE seo_sync_runs SET status='cancelled',completed_at=NOW() WHERE id=$1 AND lease_id=$2", [run.id, lease]);
        return {
          skipped: true,
          reason: 'CONNECTION_CHANGED'
        };
      }
      let cursor = new Date(run.cursor_date).toISOString().slice(0, 10),
        end = new Date(run.end_date).toISOString().slice(0, 10);
      for (let n = 0; n < 2 && cursor <= end; n++) {
        const total = await fetchDay(run.property_url, cursor, 'total'),
          detail = await fetchDay(run.property_url, cursor, 'detail');
        await store.transaction(async tx => {
          await tx.query("SELECT provider FROM seo_integrations WHERE provider='search_console' FOR UPDATE");
          const locked = (await tx.query("SELECT r.id FROM seo_sync_runs r JOIN seo_integrations i ON i.provider=r.provider WHERE r.id=$1 AND r.lease_id=$2 AND r.status='running' AND i.status='connected' AND i.version=r.connection_version AND i.property_url=r.property_url FOR UPDATE OF r", [run.id, lease])).rows;
          if (!locked.length) fail(409, 'CONNECTION_CHANGED', 'The Google connection changed during synchronization.');
          await tx.query("DELETE FROM seo_search_metrics WHERE integration='search_console' AND property_url=$1 AND search_date=$2", [run.property_url, cursor]);
          for (const [kind, data] of [['total', total], ['detail', detail]]) {
            for (let offset = 0; offset < data.rows.length; offset += 500) {
              const payload = data.rows.slice(offset, offset + 500).map(r => ({
                ...r,
                row_hash: hash([r.query, r.page, r.country, r.device])
              }));
              await tx.query(`INSERT INTO seo_search_metrics(integration,property_url,kind,search_date,query,page,country,device,row_hash,clicks,impressions,position)
 SELECT 'search_console',$1,$2,$3,x.query,x.page,x.country,x.device,x.row_hash,x.clicks,x.impressions,x.position FROM jsonb_to_recordset($4::jsonb) AS x(query text,page text,country text,device text,row_hash text,clicks double precision,impressions double precision,position double precision)
 ON CONFLICT(integration,property_url,kind,search_date,row_hash) DO UPDATE SET clicks=EXCLUDED.clicks,impressions=EXCLUDED.impressions,position=EXCLUDED.position,imported_at=NOW()`, [run.property_url, kind, cursor, JSON.stringify(payload)]);
            }
          }
          const next = shiftDay(cursor, 1);
          await tx.query("UPDATE seo_sync_runs SET cursor_date=$3,processed_rows=processed_rows+$4,truncated=truncated OR $5,attempts=0,heartbeat_at=NOW() WHERE id=$1 AND lease_id=$2", [run.id, lease, next, total.rows.length + detail.rows.length, total.truncated || detail.truncated]);
        });
        cursor = shiftDay(cursor, 1);
      }
      const done = cursor > end;
      await store.query("UPDATE seo_sync_runs SET status=$3,completed_at=CASE WHEN $3='completed' THEN NOW() ELSE NULL END,heartbeat_at=NOW(),lease_id=NULL WHERE id=$1 AND lease_id=$2", [run.id, lease, done ? 'completed' : 'queued']);
      if (done) await store.query("UPDATE seo_integrations SET last_sync_at=NOW(),error_code=NULL WHERE provider='search_console' AND version=$1", [run.connection_version]);
      return {
        ok: true
      };
    } catch (e) {
      const attempts = Number(run.attempts) + 1,
        permanent = ['GOOGLE_NOT_CONNECTED', 'PROPERTY_ACCESS_REQUIRED', 'CONNECTION_CHANGED', 'PROVIDER_ACCESS_REQUIRED'].includes(e.code);
      await store.query("UPDATE seo_sync_runs SET status=$3,attempts=$4,error_code=$5,next_attempt_at=NOW()+($6::text||' seconds')::interval,heartbeat_at=NOW(),lease_id=NULL WHERE id=$1 AND lease_id=$2", [run.id, lease, permanent || attempts >= 5 ? 'failed' : 'retry', attempts, e.code || 'SEARCH_SYNC_FAILED', Math.min(3600, 60 * 2 ** attempts)]);
      return {
        errors: 1
      };
    }
  };
  const where = (c, input, period) => {
    const args = [c.property_url, period.start, period.end],
      parts = ['property_url=$1', 'search_date BETWEEN $2::date AND $3::date'];
    let detail = false;
    for (const field of ['query', 'page', 'country', 'device']) {
      const value = text(input[field], field === 'page' ? 2048 : 200);
      if (!value) continue;
      detail = true;
      if (field === 'country' && !/^[a-z]{3}$/.test(value)) fail(400, 'INVALID_COUNTRY', 'Use a three-letter Search Console country code, for example nga.');
      if (field === 'device' && !['desktop', 'mobile', 'tablet'].includes(value)) fail(400, 'INVALID_DEVICE', 'Choose desktop, mobile or tablet.');
      args.push(value);
      parts.push(['query', 'page'].includes(field) ? `strpos(lower(${field}),lower($${args.length}))>0` : `${field}=$${args.length}`);
    }
    args.push(detail ? 'detail' : 'total');
    parts.push(`kind=$${args.length}`);
    return {
      sql: parts.join(' AND '),
      args,
      detail
    };
  };
  const sums = 'SUM(clicks)::double precision AS clicks,SUM(impressions)::double precision AS impressions,SUM(clicks)/NULLIF(SUM(impressions),0) AS ctr,SUM(position*impressions)/NULLIF(SUM(impressions),0) AS position';
  const performance = async (input = {}) => {
    const c = await google.connection('search_console');
    if (!c?.property_url) return {
      empty: true,
      reason: 'Select a verified Search Console property.',
      summary: null,
      comparison: null,
      trend: [],
      topQueries: [],
      visibleQueries: [],
      topPages: [],
      visiblePages: [],
      countries: [],
      devices: []
    };
    const period = range(input),
      base = where(c, input, period),
      previous = where(c, input, {
        start: shiftDay(period.start, -period.length),
        end: shiftDay(period.start, -1)
      });
    const aggregate = async clause => {
      const row = (await store.query(`SELECT COUNT(*)::int AS records,${sums} FROM seo_search_metrics WHERE ${clause.sql}`, clause.args)).rows[0];
      return row?.records ? row : null;
    };
    const [summary, comparison, trend] = await Promise.all([aggregate(base), aggregate(previous), store.query(`SELECT search_date::text AS date,${sums} FROM seo_search_metrics WHERE ${base.sql} GROUP BY search_date ORDER BY search_date`, base.args)]);
    const detail = where(c, {
      ...input,
      ...(!base.detail ? {
        query: ''
      } : {})
    }, period);
    detail.sql = detail.sql.replace(/kind=\$\d+$/, `kind='detail'`);
    detail.args = detail.args.slice(0, -1);
    const group = async (field, sort = 'clicks') => (await store.query(`SELECT ${field} AS label,${sums} FROM seo_search_metrics WHERE ${detail.sql} GROUP BY ${field} ORDER BY ${sort} DESC,${field} LIMIT 100`, detail.args)).rows;
    const [topQueries, visibleQueries, topPages, visiblePages, countries, devices] = await Promise.all([group('query'), group('query', 'impressions'), group('page'), group('page', 'impressions'), group('country', 'impressions'), group('device', 'impressions')]);
    const coverageFor = async (start,end) => {
      const row=(await store.query("SELECT COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM seo_sync_runs r WHERE r.provider='search_console' AND r.property_url=$1 AND r.start_date<=d::date AND r.cursor_date>d::date))::int AS recorded_days FROM generate_series($2::date,$3::date,INTERVAL '1 day') d",[c.property_url,start,end])).rows[0];
      const recorded=Number(row?.recorded_days)||0;
      return {recorded_days:recorded,requested_days:period.length,complete:recorded===period.length};
    };
    const [coverage,comparisonCoverage]=await Promise.all([coverageFor(period.start,period.end),coverageFor(shiftDay(period.start,-period.length),shiftDay(period.start,-1))]);
    const coverageNote='Dates '+period.start+' to '+period.end+'. '+(coverage.complete?'All requested dates have completed day imports.':coverage.recorded_days+' of '+period.length+' dates have completed imports; period totals are incomplete.');
    return {
      coverage,
      comparison_coverage:comparisonCoverage,
      empty_message:!summary?(coverage.complete?'Google returned no available rows for this completed date range. This is not a measured zero-traffic claim.':'No complete performance report is available yet. Request a refresh and check its progress in History.'):null,
      empty: !summary,
      period,
      summary,
      comparison,
      trend: trend.rows,
      topQueries,
      visibleQueries,
      topPages,
      visiblePages,
      countries,
      devices,
      source: 'google_search_console',
      headline_scope: base.detail ? 'Returned query-level rows matching filters' : 'Property totals',
      limitations: 'Query-level tables omit anonymised queries and may be limited to top rows. Their sums can differ from property totals. Position is impression-weighted; CTR is clicks divided by impressions. '+coverageNote+(comparisonCoverage.complete?'':' The previous comparison period is not fully imported.'),
      connection_status: c.status,
      last_sync_at: c.last_sync_at
    };
  };
  const inspect = async (url, actor) => {
    const c = await connected(),
      target = canonicalUrl(url, frontend()),
      cacheKey = hash([c.property_url, target]);
    const cached = (await store.query("SELECT id,result,created_at FROM seo_observations WHERE kind='url_inspection' AND cache_key=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [cacheKey])).rows[0];
    if (cached) return {
      id: cached.id,
      ...cached.result,
      cached: true,
      checked_at: cached.created_at
    };
    await store.reserve('url_inspection', 200);
    const r = await google.request('search_console', {
      method: 'POST',
      url: 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      data: {
        inspectionUrl: target,
        siteUrl: c.property_url,
        languageCode: 'en-US'
      }
    });
    const result = r.data.inspectionResult;
    if (!result) fail(502, 'GOOGLE_INVALID_DATA', 'Google did not return an inspection result.');
    return store.observe('url_inspection', target, {
      source: 'google_url_inspection',
      url: target,
      inspection: result,
      checked_at: new Date().toISOString(),
      note: 'Google indexed version only; this is not a live crawl test.'
    }, {
      actorId: actor.id,
      cacheKey,
      ttlHours: 24
    });
  };
  const submitSitemap = async actor => {
    const c = await connected();
    if (!c.scopes.includes(google.scopes.WRITE)) fail(409, 'SITEMAP_PERMISSION_REQUIRED', 'Reconnect Search Console with the optional sitemap permission.');
    const {
      generateSitemap,
      getSitemapInfo
    } = require('../../config/utils/sitemapGenerator');
    const xml = await generateSitemap({
      force: true
    });
    const url = frontend() + '/sitemap.xml';
    await store.reserve('sitemap_submission', 20);
    await google.request('search_console', {
      method: 'PUT',
      url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c.property_url)}/sitemaps/${encodeURIComponent(url)}`
    });
    await audit({
      actorId: actor.id,
      action: 'SEO_SITEMAP_SUBMITTED',
      targetType: 'search_console'
    });
    return store.observe('sitemap', url, {
      source: 'google_search_console',
      google_accepted: true,
      indexing_confirmed: false,
      urlCount: (await getSitemapInfo()).urlCount,
      submitted_at: new Date().toISOString()
    }, {
      actorId: actor.id
    });
  };
  const runs = async () => (await store.query('SELECT id,status,start_date,end_date,cursor_date,processed_rows,truncated,attempts,error_code,created_at,completed_at FROM seo_sync_runs ORDER BY created_at DESC LIMIT 30')).rows;
  return {
    sites,
    selectProperty,
    enqueue,
    work,
    performance,
    inspect,
    submitSitemap,
    runs,
    ownSite
  };
}
module.exports = {
  createSearchConsole
};
