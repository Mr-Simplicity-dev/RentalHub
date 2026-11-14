const axios = require('axios');
const {
  parseDocument
} = require('htmlparser2');
const {
  canonicalUrl,
  hash,
  fail
} = require('./core');
function createTechnicalAudit({
  store,
  http = axios,
  env = process.env,
  frontend = () => require('../../config/utils/frontendUrl').getFrontendUrl(),
  sitemap = () => require('../../config/utils/seoPageService').getSitemapUrls()
}) {
  const fetchPage = async url => {
    let target = canonicalUrl(url, frontend());
    for (let n = 0; n < 4; n++) {
      const response = await http.get(target, {
        timeout: 15000,
        maxRedirects: 0,
        maxContentLength: 1048576,
        maxBodyLength: 1048576,
        validateStatus: () => true,
        headers: {
          Accept: 'text/html',
          'User-Agent': 'RentalHubSEOReview/1.0'
        }
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        target = canonicalUrl(new URL(response.headers.location, target).href, frontend());
        continue;
      }
      return {
        url: target,
        response
      };
    }
    fail(502, 'SEO_REDIRECT_LIMIT', 'The page redirects too many times.');
  };
  const analyse = (url, response, known) => {
    const issues = [],
      add = (code, severity, message, action) => issues.push({
        code,
        severity,
        message,
        action
      });
    const html = typeof response.data === 'string' ? response.data : '';
    if (response.status !== 200) add('HTTP_STATUS', 'high', `Page returned HTTP ${response.status}.`, 'Check the public route and server.');
    const nodes = [],
      walk = n => {
        if (n.type === 'tag' || n.type === 'script') nodes.push(n);
        for (const c of n.children || []) walk(c);
      };
    walk(parseDocument(html));
    const text = n => (n?.children || []).map(c => c.type === 'text' ? c.data : text(c)).join('').trim();
    const tags = name => nodes.filter(n => n.name === name),
      meta = name => tags('meta').find(n => (n.attribs.name || n.attribs.property || '').toLowerCase() === name)?.attribs.content || '';
    const titles = tags('title'),
      title = text(titles[0]),
      description = meta('description');
    if (titles.length !== 1 || !title) add('TITLE', 'high', 'Page needs exactly one useful title.', 'Set a unique title for this page.');
    if (!description) add('DESCRIPTION', 'medium', 'Search description is missing.', 'Write a factual description.');
    const canonical = tags('link').filter(n => (n.attribs.rel || '').split(/\s+/).includes('canonical'));
    if (canonical.length !== 1) add('CANONICAL', 'high', 'Page needs exactly one canonical URL.', 'Use the clean public page URL.');else {
      try {
        if (canonicalUrl(canonical[0].attribs.href, frontend()) !== url) add('CANONICAL_OTHER', 'medium', 'Canonical points to another public page.', 'Review whether this page should be indexed separately.');
      } catch {
        add('CANONICAL_INVALID', 'high', 'Canonical is not a clean RentalHub URL.', 'Correct the canonical URL.');
      }
    }
    if (tags('h1').length !== 1) add('HEADING', 'medium', 'Page needs one clear main heading.', 'Check the main page heading.');
    if (!meta('og:title') || !meta('og:description') || !meta('og:image')) add('SOCIAL_METADATA', 'low', 'Social preview fields are incomplete.', 'Add accurate Open Graph fields.');
    const missingAlt = tags('img').filter(n => !Object.hasOwn(n.attribs, 'alt')).length;
    if (missingAlt) add('IMAGE_ALT', 'medium', `${missingAlt} images have no alt attribute.`, 'Describe useful images; use empty alt for decoration.');
    for (const script of tags('script').filter(n => n.attribs.type === 'application/ld+json')) try {
      JSON.parse(text(script));
    } catch {
      add('JSON_LD', 'high', 'Structured data is not valid JSON.', 'Correct and validate the structured data.');
    }
    const structured = tags('script').filter(node => node.attribs.type === 'application/ld+json');
    if (!structured.length && !nodes.some(node => Object.hasOwn(node.attribs || {}, 'itemscope'))) add('STRUCTURED_DATA_MISSING', 'low', 'No structured data was found in the returned HTML.', 'Add relevant structured data only where this page genuinely qualifies.');
    const language = tags('html')[0]?.attribs.lang || '';
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(language)) add('HTML_LANGUAGE', 'medium', 'The returned HTML has no valid language declaration.', 'Set the correct language on the html element and review it against the page text.');
    let headingLevel = 0;
    for (const node of nodes.filter(node => /^h[1-6]$/.test(node.name))) {
      const nextLevel = Number(node.name.slice(1));
      if (headingLevel && nextLevel > headingLevel + 1) { add('HEADING_ORDER', 'low', 'The returned HTML skips a heading level.', 'Review the heading order so sections are easy to follow.'); break; }
      headingLevel = nextLevel;
    }
    const noindex = /noindex/i.test(meta('robots') + ' ' + (response.headers['x-robots-tag'] || ''));
    if (noindex && known.has(url)) add('SITEMAP_NOINDEX', 'high', 'A noindex page is in the sitemap.', 'Remove it from the sitemap or review the index setting.');
    const internal_links = [...new Set(tags('a').map(n => n.attribs.href).filter(Boolean).map(href => {
      try {
        return canonicalUrl(new URL(href, url).href, frontend());
      } catch {
        return null;
      }
    }).filter(Boolean))].slice(0, 5);
    const has_next_action = tags('a').some(n => /\/properties|\/register|\/careers/.test(n.attribs.href || ''));
    return {
      url,
      status: response.status,
      title,
      description,
      noindex,
      has_next_action,
      language,
      structured_data_present: structured.length > 0 || nodes.some(node => Object.hasOwn(node.attribs || {}, 'itemscope')),
      internal_links,
      issues
    };
  };
  const run = async (input, actor) => {
    const urls = Array.isArray(input.urls) ? input.urls : [];
    if (!urls.length || urls.length > 10) fail(400, 'AUDIT_URL_LIMIT', 'Choose between one and ten public RentalHub pages.');
    const targets = [...new Set(urls.map(u => canonicalUrl(u, frontend())))],
      known = new Set((await sitemap()).map(x => typeof x === 'string' ? x : x.url)),
      pages = [];
    for (const target of targets) {
      try {
        const {
          url,
          response
        } = await fetchPage(target);
        pages.push(analyse(url, response, known));
      } catch (e) {
        pages.push({
          url: target,
          status: null,
          issues: [{
            code: e.code === 'INVALID_PUBLIC_URL' ? 'UNSAFE_REDIRECT' : 'PAGE_UNAVAILABLE',
            severity: 'high',
            message: 'The public page could not be checked safely.',
            action: 'Check its route, server response and redirects.'
          }]
        });
      }
    }
    const duplicates = field => {
      const seen = new Map();
      for (const page of pages) {
        if (!page[field]) continue;
        const existing = seen.get(page[field]);
        if (existing) page.issues.push({
          code: 'DUPLICATE_' + field.toUpperCase(),
          severity: 'medium',
          message: `The ${field} matches another checked page.`,
          action: 'Review these pages for distinct, useful content.'
        });
        seen.set(page[field], page.url);
      }
    };
    duplicates('title');
    duplicates('description');
    const links = new Map();
    for (const page of pages) for (const link of page.internal_links || []) if (!targets.includes(link) && links.size < 5) links.set(link, null);
    for (const link of links.keys()) {
      try {
        const checked = await fetchPage(link);
        links.set(link, checked.response.status);
      } catch {
        links.set(link, 'unavailable');
      }
    }
    for (const page of pages) {
      page.checked_links = (page.internal_links || []).filter(link => links.has(link)).map(url => ({
        url,
        status: links.get(url)
      }));
      for (const link of page.checked_links) if ([404, 410].includes(link.status)) page.issues.push({
        code: 'BROKEN_INTERNAL_LINK',
        severity: 'medium',
        message: 'A checked public link returned HTTP ' + link.status + '.',
        action: 'Update or remove the link to ' + link.url
      });
    }
    return store.observe('technical_audit', targets.join(', '), {
      source: 'rentalhub_html_audit',
      checked_at: new Date().toISOString(),
      pages,
      limitations: 'Checks returned HTML only. At most five distinct public internal links are checked per audit. External/private links, visual layout, full schema eligibility, conversion rates and Core Web Vitals are not inferred.'
    }, {
      actorId: actor.id
    });
  };
  const pagespeed = async (input, actor) => {
    if (!env.PAGESPEED_API_KEY) fail(409, 'PAGESPEED_NOT_CONFIGURED', 'Configure a PageSpeed API key to run this check.');
    const url = canonicalUrl(input.url, frontend()),
      strategy = input.strategy === 'desktop' ? 'desktop' : 'mobile',
      cacheKey = hash([url, strategy]);
    const cached = (await store.query("SELECT id,result FROM seo_observations WHERE kind='pagespeed' AND cache_key=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1", [cacheKey])).rows[0];
    if (cached) return {
      ...cached.result,
      id: cached.id,
      cached: true
    };
    await store.reserve('pagespeed', 20);
    let r;
    try {
      r = await http.get('https://www.googleapis.com/pagespeedonline/v5/runPagespeed', {
        params: {
          url,
          strategy,
          key: env.PAGESPEED_API_KEY,
          category: 'performance'
        },
        timeout: 60000,
        maxContentLength: 5242880
      });
    } catch {
      fail(502, 'PAGESPEED_UNAVAILABLE', 'Google could not complete the PageSpeed check.');
    }
    if (!r.data.lighthouseResult) fail(502, 'PAGESPEED_INVALID_DATA', 'Google returned no PageSpeed report.');
    return store.observe('pagespeed', url, {
      source: 'google_pagespeed',
      url,
      strategy,
      checked_at: new Date().toISOString(),
      lab: r.data.lighthouseResult,
      field: r.data.loadingExperience || null,
      origin_field: r.data.originLoadingExperience || null,
      note: 'Lab measurements and real-user field data are different. Missing field data is not a passing result.'
    }, {
      actorId: actor.id,
      cacheKey,
      ttlHours: 24
    });
  };
  return {
    run,
    pagespeed,
    analyse
  };
}
module.exports = {
  createTechnicalAudit
};
