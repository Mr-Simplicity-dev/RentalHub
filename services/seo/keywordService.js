const {
  fail,
  text,
  hash,
  canonicalUrl
} = require('./core');
function createKeywords({
  store,
  google,
  env = process.env,
  audit = async () => {}
}) {
  const adsReady = () => {
    if (!/^\d{10}$/.test(String(env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '')) || !env.GOOGLE_ADS_DEVELOPER_TOKEN || !/^v\d+$/.test(env.GOOGLE_ADS_API_VERSION || '')) fail(409, 'GOOGLE_ADS_SETUP_REQUIRED', 'Configure an approved Google Ads developer token, customer ID and supported API version first.');
  };
  const ads = async (action, data) => {
    adsReady();
    await store.reserve('google_ads', 100);
    const headers = {
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN
    };
    if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
      const login = String(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/-/g, '');
      if (!/^\d{10}$/.test(login)) fail(503, 'GOOGLE_ADS_SETUP_REQUIRED', 'The configured Ads manager ID is invalid.');
      headers['login-customer-id'] = login;
    }
    return google.request('google_ads', {
      method: 'POST',
      url: `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${String(env.GOOGLE_ADS_CUSTOMER_ID).replace(/-/g, '')}:${action}`,
      headers,
      data
    });
  };
  const research = async (input, actor) => {
    const seeds = Array.isArray(input.seeds) ? [...new Set(input.seeds.map(v => text(v, 200)).filter(Boolean))] : [];
    if (seeds.length > 20) fail(400, 'TOO_MANY_SEEDS', 'Use up to 20 seed keywords.');
    const url = input.url ? canonicalUrl(input.url) : null;
    if (!seeds.length && !url) fail(400, 'KEYWORD_SEED_REQUIRED', 'Enter a seed keyword or a RentalHub landing page.');
    const language = input.language || 'languageConstants/1000';
    if (!/^languageConstants\/\d+$/.test(language)) fail(400, 'INVALID_ADS_LANGUAGE', 'Use a Google Ads language resource.');
    let geo = Array.isArray(input.geoTargets) ? input.geoTargets : [];
    if (geo.length > 10 || geo.some(v => !/^geoTargetConstants\/\d+$/.test(v))) fail(400, 'INVALID_ADS_LOCATION', 'Use up to 10 Google Ads location resources.');
    const cacheKey = hash({
      account: env.GOOGLE_ADS_CUSTOMER_ID,
      version: env.GOOGLE_ADS_API_VERSION,
      seeds: [...seeds].sort(),
      url,
      language,
      geo: [...geo].sort()
    });
    const cached = (await store.query("SELECT id,result,created_at FROM seo_observations WHERE kind='keyword_research' AND cache_key=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [cacheKey])).rows[0];
    if (cached) return {
      ...cached.result,
      id: cached.id,
      cached: true
    };
    if (!geo.length) {
      adsReady();
      await store.reserve('google_ads', 100);
      const r = await google.request('google_ads', {
        method: 'POST',
        url: `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/geoTargetConstants:suggest`,
        headers: {
          'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN
        },
        data: {
          locale: 'en',
          countryCode: 'NG',
          locationNames: {
            names: ['Nigeria']
          }
        }
      });
      const nigeria = (r.data.geoTargetConstantSuggestions || []).find(x => x.geoTargetConstant?.name === 'Nigeria' && x.geoTargetConstant?.countryCode === 'NG');
      if (!nigeria) fail(502, 'GOOGLE_ADS_LOCATION_UNAVAILABLE', 'Google did not return the Nigeria target. Select an approved Google Ads location resource.');
      geo = [nigeria.geoTargetConstant.resourceName];
    }
    const seed = seeds.length && url ? {
      keywordAndUrlSeed: {
        keywords: seeds,
        url
      }
    } : seeds.length ? {
      keywordSeed: {
        keywords: seeds
      }
    } : {
      urlSeed: {
        url
      }
    };
    const ideas = [];
    let pageToken;
    for (let n = 0; n < 3; n++) {
      const r = await ads('generateKeywordIdeas', {
        ...seed,
        language,
        geoTargetConstants: geo,
        includeAdultKeywords: false,
        keywordPlanNetwork: 'GOOGLE_SEARCH',
        pageSize: 1000,
        ...(pageToken ? {
          pageToken
        } : {})
      });
      if (!Array.isArray(r.data.results)) fail(502, 'GOOGLE_ADS_INVALID_DATA', 'Google did not return keyword ideas.');
      for (const row of r.data.results) {
        const m = row.keywordIdeaMetrics || {};
        ideas.push({
          keyword: row.text,
          close_variants: row.closeVariants || [],
          average_monthly_searches: m.avgMonthlySearches === undefined ? null : Number(m.avgMonthlySearches),
          monthly_searches: m.monthlySearchVolumes || [],
          competition: m.competition || null,
          competition_index: m.competitionIndex === undefined ? null : Number(m.competitionIndex),
          low_top_of_page_bid_micros: m.lowTopOfPageBidMicros || null,
          high_top_of_page_bid_micros: m.highTopOfPageBidMicros || null
        });
      }
      pageToken = r.data.nextPageToken;
      if (!pageToken) break;
    }
    await audit({
      actorId: actor.id,
      action: 'SEO_KEYWORD_RESEARCH_REQUESTED',
      targetType: 'google_ads'
    });
    return store.observe('keyword_research', seeds.join(', ') || url, {
      source: 'google_ads_keyword_planner',
      estimates: true,
      seeds,
      url,
      language,
      geoTargets: geo,
      ideas,
      limited: Boolean(pageToken),
      note: 'Estimated Google Ads demand and advertising competition, not actual Search Console traffic or organic SEO difficulty.',
      retrieved_at: new Date().toISOString()
    }, {
      actorId: actor.id,
      cacheKey,
      ttlHours: 24
    });
  };
  const list = async (input = {}) => {
    const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100),
      offset = Math.max(Number(input.offset) || 0, 0),
      q = text(input.q),
      group = text(input.group, 120);
    return (await store.query("SELECT *,COUNT(*) OVER()::int AS total_count FROM seo_keywords WHERE is_active=TRUE AND ($1='' OR strpos(normalized_keyword,lower($1))>0) AND ($2='' OR group_name=$2) ORDER BY is_target DESC,keyword,id LIMIT $3 OFFSET $4", [q, group, limit, offset])).rows;
  };
  const save = async (input, actor) => {
    const keyword = text(input.keyword, 200);
    if (!keyword) fail(400, 'KEYWORD_REQUIRED', 'Enter a keyword.');
    const country = text(input.country || 'ng', 20).toLowerCase(),
      language = text(input.language || 'en', 20),
      location = text(input.location, 150);
    if (!/^[a-z]{2}$/.test(country) || !/^[a-z]{2,3}(?:-[a-z]{2})?$/i.test(language)) fail(400, 'INVALID_TRACKING_TARGET', 'Choose a valid search country and language.');
    const frequency = Number(input.frequency_hours || 168);
    if (!Number.isInteger(frequency) || frequency < 24 || frequency > 2160) fail(400, 'INVALID_TRACKING_FREQUENCY', 'Choose a frequency from 24 to 2160 hours.');
    const target = input.target_url ? canonicalUrl(input.target_url) : null;
    let metrics = null,
      updated = null;
    if (input.research_id) {
      const observation = (await store.query("SELECT result,created_at FROM seo_observations WHERE id=$1 AND kind='keyword_research'", [input.research_id])).rows[0];
      const idea = observation?.result?.ideas?.find(x => x.keyword === keyword);
      if (!idea) fail(400, 'KEYWORD_RESEARCH_NOT_FOUND', 'Save a keyword from an existing research result, or add it without volume estimates.');
      metrics = idea;
      updated = observation.created_at;
    }
    const settings = await store.settings();
    if (input.is_tracked === true) {
      const count = (await store.query('SELECT COUNT(*)::int AS total FROM seo_keywords WHERE is_active AND is_tracked')).rows[0]?.total || 0;
      const existing = (await store.query(input.id ? 'SELECT id,is_tracked FROM seo_keywords WHERE id=$1' : 'SELECT id,is_tracked FROM seo_keywords WHERE normalized_keyword=$1 AND country=$2 AND language=$3 AND location=$4', input.id ? [input.id] : [keyword.toLowerCase(), country, language, location])).rows[0];
      if (!existing?.is_tracked && count >= Number(settings.ranking_max_keywords || 200)) fail(409, 'TRACKING_LIMIT_REACHED', 'The configured keyword tracking limit has been reached.');
    }
    if (input.id) {
      if (!/^\d{1,16}$/.test(String(input.id))) fail(400, 'INVALID_ID', 'Choose a valid saved keyword.');
      let result;
      try {
        result = await store.query("UPDATE seo_keywords SET keyword=$2,normalized_keyword=$3,country=$4,language=$5,location=$6,group_name=$7,target_url=$8,is_target=$9,is_tracked=$10,frequency_hours=$11,metrics=COALESCE($12::jsonb,metrics),metrics_source=COALESCE($13,metrics_source),metrics_updated_at=COALESCE($14,metrics_updated_at),updated_at=NOW() WHERE id=$1 AND is_active RETURNING *", [input.id, keyword, keyword.toLowerCase(), country, language, location, text(input.group_name, 120), target, input.is_target === true, input.is_tracked === true, frequency, metrics ? JSON.stringify(metrics) : null, metrics ? 'google_ads_keyword_planner' : null, updated]);
      } catch (e) {
        if (e.code === '23505') fail(409, 'KEYWORD_ALREADY_SAVED', 'This keyword and location are already saved. Edit that record instead.');
        throw e;
      }
      if (!result.rows.length) fail(404, 'KEYWORD_NOT_FOUND', 'The saved keyword was not found.');
      await audit({
        actorId: actor.id,
        action: 'SEO_KEYWORD_UPDATED',
        targetType: 'seo_keyword',
        targetId: input.id
      });
      return result.rows[0];
    }
    const row = (await store.query(`INSERT INTO seo_keywords(keyword,normalized_keyword,country,language,location,group_name,target_url,is_target,is_tracked,frequency_hours,metrics,metrics_source,metrics_updated_at,created_by)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14) ON CONFLICT(normalized_keyword,country,language,location) DO UPDATE SET keyword=$1,group_name=$6,target_url=$7,is_target=$8,is_tracked=$9,frequency_hours=$10,is_active=TRUE,metrics=COALESCE(EXCLUDED.metrics,seo_keywords.metrics),metrics_source=COALESCE(EXCLUDED.metrics_source,seo_keywords.metrics_source),metrics_updated_at=COALESCE(EXCLUDED.metrics_updated_at,seo_keywords.metrics_updated_at),updated_at=NOW() RETURNING *`, [keyword, keyword.toLowerCase(), country, language, location, text(input.group_name, 120), target, input.is_target === true, input.is_tracked === true, frequency, metrics ? JSON.stringify(metrics) : null, metrics ? 'google_ads_keyword_planner' : null, updated, actor.id])).rows[0];
    await audit({
      actorId: actor.id,
      action: 'SEO_KEYWORD_SAVED',
      targetType: 'seo_keyword',
      targetId: row.id
    });
    return row;
  };
  const remove = async (id, actor) => {
    await store.query('UPDATE seo_keywords SET is_active=FALSE,is_tracked=FALSE,updated_at=NOW() WHERE id=$1', [id]);
    await audit({
      actorId: actor.id,
      action: 'SEO_KEYWORD_REMOVED',
      targetType: 'seo_keyword',
      targetId: id
    });
    return {
      removed: true
    };
  };
  const queueChecks = async actor => {
    const total = (await store.query('SELECT COUNT(*)::int AS total FROM seo_keywords WHERE is_active AND is_tracked')).rows[0]?.total || 0;
    if (!total) fail(409, 'NO_TRACKED_KEYWORDS', 'Save a keyword and enable tracking before requesting a ranking check. Existing configured keywords can be imported from the website.');
    await store.query('UPDATE seo_keywords SET next_check_at=NOW() WHERE is_active AND is_tracked');
    await audit({
      actorId: actor.id,
      action: 'SEO_RANKING_CHECKS_QUEUED',
      targetType: 'seo_keyword'
    });
    return {
      queued: true,
      message: 'Tracked keywords are queued. Daily provider limits still apply.'
    };
  };
  const competitors = async () => (await store.query('SELECT domain,label FROM seo_competitors WHERE is_active ORDER BY domain')).rows;
  const saveCompetitor = async (input, actor) => {
    let domain;
    try {
      const u = new URL('https://' + text(input.domain, 253).replace(/^https?:\/\//, ''));
      domain = u.hostname.toLowerCase().replace(/^www\./, '');
      if (u.username || u.password || u.pathname !== '/' || u.search || u.hash || !domain.includes('.') || /^[\d.]+$/.test(domain)) throw Error();
    } catch {
      fail(400, 'INVALID_COMPETITOR_DOMAIN', 'Enter a domain name, without a path or account details.');
    }
    await store.query('INSERT INTO seo_competitors(domain,label,created_by) VALUES($1,$2,$3) ON CONFLICT(domain) DO UPDATE SET label=$2,is_active=TRUE', [domain, text(input.label, 150), actor.id]);
    return {
      domain
    };
  };
  const importConfigured = async actor => {
    const configured = [...new Set(String(env.SEO_RANKING_KEYWORDS || '').split(',').map(k => text(k, 200)).filter(Boolean))].slice(0, 200);
    let imported = 0;
    for (const keyword of configured) {
      const existing = await store.query("SELECT id FROM seo_keywords WHERE normalized_keyword=$1 AND country='ng' AND language='en' AND location=''", [keyword.toLowerCase()]);
      if (existing.rows.length) continue;
      await save({
        keyword,
        is_tracked: false
      }, actor);
      imported++;
    }
    await audit({
      actorId: actor.id,
      action: 'SEO_CONFIGURED_KEYWORDS_IMPORTED',
      targetType: 'seo'
    });
    return {
      imported,
      configured: configured.length,
      message: configured.length ? 'Existing keywords were imported without paid tracking. Enable tracking only for the terms you choose.' : 'No existing keyword list is configured on the server.'
    };
  };
  return {
    research,
    list,
    save,
    remove,
    queueChecks,
    importConfigured,
    competitors,
    saveCompetitor,
    removeCompetitor: async domain => {
      await store.query('UPDATE seo_competitors SET is_active=FALSE WHERE domain=$1', [text(domain, 253)]);
      return {
        removed: true
      };
    },
    trends: seeds => ({
      source: 'google_trends_manual',
      api_available: false,
      reason: 'Official API access is limited to approved alpha users. No Trends values are collected here.',
      url: 'https://trends.google.com/trends/explore?geo=NG&q=' + encodeURIComponent((Array.isArray(seeds) ? seeds : []).slice(0, 5).join(',')),
      note: 'Trends measures relative interest, not exact monthly searches.'
    })
  };
}
module.exports = {
  createKeywords
};
