const {
  fail,
  text,
  hash,
  range,
  shiftDay
} = require('./core');
function createIntelligence({
  store,
  search,
  audit = async () => {}
}) {
  const generate = async (input, actor) => {
    const period = range(input),
      settings = await store.settings(),
      min = Number(settings.min_impressions) || 100,
      low = Number(settings.low_ctr) || 0.02,
      loss = Number(settings.loss_ratio) || 0.2;
    const [current, previous, keywords] = await Promise.all([search.performance(period), search.performance({
      start: shiftDay(period.start, -period.length),
      end: shiftDay(period.start, -1)
    }), store.query('SELECT keyword,target_url,group_name,metrics FROM seo_keywords WHERE is_active')]);
    const comparisonReady=current.coverage?.complete===true&&previous.coverage?.complete===true;
    const found = [];
    const add = (rule, {
      query = null,
      page = null,
      priority = 'medium',
      reason,
      action,
      evidence,
      source = 'google_search_console'
    }) => found.push({
      id: hash([rule, query, page]),
      rule,
      query,
      page,
      priority,
      reason,
      action,
      evidence: {
        period,
        ...evidence
      },
      source
    });
    for (const row of current.topQueries || []) {
      if (Number(row.impressions) >= min && Number(row.ctr) < low) add('low_ctr', {
        query: row.label,
        reason: 'This returned query has useful visibility but a low click-through rate.',
        action: 'Review the matching page title and description against the search intent.',
        evidence: {
          ...row,
          minimum_impressions: min,
          ctr_threshold: low
        }
      });
      if (Number(row.impressions) >= min && Number(row.position) >= 5 && Number(row.position) <= 20) add('near_top_results', {
        query: row.label,
        reason: 'The impression-weighted position is between 5 and 20.',
        action: 'Improve relevant content and internal links; confirm that the page meets this query’s intent.',
        evidence: row
      });
      const before = (previous.topQueries || []).find(x => x.label === row.label);
      if (comparisonReady && before && Number(before.impressions) >= min && Number(row.impressions) > Number(before.impressions) * 1.25) add('rising_visibility', {
        query: row.label,
        priority: 'low',
        reason: 'This query gained impressions compared with the previous equal-length period.',
        action: 'Review the relevant page and keep useful information current.',
        evidence: {
          current: row,
          previous: before
        }
      });
    }
    for (const row of current.topPages || []) {
      const before = (previous.topPages || []).find(x => x.label === row.label);
      if (comparisonReady && before && Number(before.impressions) >= min && Number(row.impressions) < Number(before.impressions) * (1 - loss)) add('declining_page', {
        page: row.label,
        priority: 'high',
        reason: 'This page lost impressions compared with the previous equal-length period.',
        action: 'Check availability, crawl status, title changes and content quality before changing the page.',
        evidence: {
          current: row,
          previous: before,
          loss_threshold: loss
        }
      });
      if (Number(row.impressions) >= min && Number(row.clicks) < 3) add('visible_page_few_clicks', {
        page: row.label,
        reason: 'This returned page received impressions but fewer than three clicks.',
        action: 'Check whether the page clearly answers the search intent and offers a useful next step.',
        evidence: row
      });
    }
    for (const row of keywords.rows) {
      if (!row.target_url && Number(row.metrics?.average_monthly_searches) > 0) add('unassigned_keyword', {
        query: row.keyword,
        reason: 'A saved keyword has Google Ads demand estimates but no assigned page.',
        action: 'Check existing pages before planning new content. This is not proof that no relevant page exists.',
        source: 'google_ads_keyword_planner',
        evidence: {
          estimated_monthly_searches: row.metrics.average_monthly_searches,
          group: row.group_name
        }
      });
    }
    const c = (await store.query("SELECT property_url FROM seo_integrations WHERE provider='search_console'")).rows[0];
    if (c?.property_url) {
      const overlapping = (await store.query("SELECT query,COUNT(DISTINCT page)::int AS pages,SUM(impressions) AS impressions FROM seo_search_metrics WHERE property_url=$1 AND kind='detail' AND search_date BETWEEN $2 AND $3 GROUP BY query HAVING COUNT(DISTINCT page)>1 AND SUM(impressions)>=$4 ORDER BY SUM(impressions) DESC LIMIT 100", [c.property_url, period.start, period.end, min])).rows;
      for (const row of overlapping) add('shared_search_intent', {
        query: row.query,
        reason: 'More than one RentalHub page appeared for the same returned query.',
        action: 'Compare search intent and distinct page value. Multiple pages are not automatically a canonical error.',
        evidence: row
      });
    }
    const latest = (await store.query("SELECT result FROM seo_observations WHERE kind='technical_audit' AND status='completed' ORDER BY created_at DESC LIMIT 1")).rows[0]?.result;
    for (const page of latest?.pages || []) {
      for (const issue of page.issues || []) if (issue.severity === 'high') add('technical_' + issue.code, {
        page: page.url,
        priority: 'high',
        reason: issue.message,
        action: issue.action || 'Review and correct the reported technical issue.',
        source: 'rentalhub_technical_audit',
        evidence: {
          issue,
          audited_at: latest.checked_at
        }
      });
      const performance = (current.topPages || []).find(x => x.label === page.url);
      if (performance && Number(performance.impressions) >= min && page.has_next_action === false) add('unclear_next_action', {
        page: page.url,
        reason: 'This visible page has no detected property-search, request or account action.',
        action: 'Review the page manually and add a relevant next action if one is missing.',
        source: 'search_console_and_technical_audit',
        evidence: {
          performance,
          audited_at: latest.checked_at,
          note: 'Conversion rate was not measured.'
        }
      });
    }
    for (const row of found) await store.query('INSERT INTO seo_opportunities(id,rule,query,page,priority,reason,action,evidence,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT(id) DO UPDATE SET priority=$5,reason=$6,action=$7,evidence=$8::jsonb,source=$9,generated_at=NOW()', [row.id, row.rule, row.query, row.page, row.priority, row.reason, row.action, JSON.stringify(row.evidence), row.source]);
    await audit({
      actorId: actor.id,
      action: 'SEO_OPPORTUNITIES_GENERATED',
      targetType: 'seo'
    });
    return {
      generated: found.length,
      period,
      limitations: 'Recommendations use returned Search Console rows, real saved Ads estimates and recorded audits. Query rows may be incomplete. Conversion rates and SEO difficulty are unavailable.'
    };
  };
  const list = async (input = {}) => (await store.query("SELECT * FROM seo_opportunities WHERE ($1='' OR status=$1) ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,generated_at DESC LIMIT 200", [text(input.status || 'open', 20)])).rows;
  const update = async (id, status, actor) => {
    if (!['open', 'dismissed', 'done'].includes(status)) fail(400, 'INVALID_OPPORTUNITY_STATUS', 'Choose open, dismissed or done.');
    await store.query('UPDATE seo_opportunities SET status=$2,updated_by=$3 WHERE id=$1', [id, status, actor.id]);
    return {
      updated: true
    };
  };
  return {
    generate,
    list,
    update
  };
}
module.exports = {
  createIntelligence
};
