const logger = require('./logger');
const Ranking = require('../models/Ranking');
const { getFrontendUrl } = require('./frontendUrl');
const {
  fetchOrganicResults,
  findTargetResult,
  getSerpApiKey,
} = require('./serpTracker');

const DEFAULT_KEYWORDS = ['houses for rent in ikeja'];
const MAX_CONFIGURED_KEYWORDS = Math.min(Math.max(Number(process.env.SEO_RANKING_MAX_KEYWORDS) || 200, 1), 1000);

const getConfiguredKeywords = () => {
  const configured = String(process.env.SEO_RANKING_KEYWORDS || '')
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean);

  return [...new Set(configured.length ? configured : DEFAULT_KEYWORDS)].slice(
    0,
    MAX_CONFIGURED_KEYWORDS
  );
};

const getRankingTargetUrl = () =>
  String(process.env.SEO_RANKING_TARGET_URL || getFrontendUrl())
    .trim()
    .replace(/\/+$/, '');

const trackRanking = async (keyword, targetUrl = getRankingTargetUrl(), options = {}) => {
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword) {
    throw new Error('A keyword is required for an SEO ranking check');
  }

  const searchDepth = Math.min(
    Math.max(Number(options.searchDepth || process.env.SEO_RANKING_SEARCH_DEPTH) || 100, 10),
    100
  );
  const country = options.country || process.env.SEO_RANKING_COUNTRY || 'ng';
  const language = options.language || process.env.SEO_RANKING_LANGUAGE || 'en';
  const organicResults = await fetchOrganicResults(normalizedKeyword, {
    searchDepth,
    country,
    language,
    location: options.location,
  });
  const match = findTargetResult(
    organicResults,
    targetUrl,
    options.match || 'domain'
  );

  const resultsReturned = organicResults.length;
  const coveredDepth = Math.max(0,...organicResults.map((row,index)=>Number.isInteger(Number(row.position))&&Number(row.position)>0?Number(row.position):index+1));
  const ranking = await Ranking.create({
    keyword: normalizedKeyword,
    keywordId: options.keywordId ? String(options.keywordId) : undefined,
    searchLocation: options.location || '',
    competitors: organicResults.filter(r => r.link && /^https?:\/\//.test(r.link)).filter(r => {try{return new URL(r.link).hostname.replace(/^www\./,'')!==new URL(targetUrl).hostname.replace(/^www\./,'');}catch{return false;}}).filter(r => !match || Number(r.position)<=match.position+5 || (options.competitorDomains||[]).includes(new URL(r.link).hostname.replace(/^www\./,''))).slice(0,20).map(r=>({domain:new URL(r.link).hostname.replace(/^www\./,''),position:Number(r.position)||null,url:r.link,title:r.title||'',monitored:(options.competitorDomains||[]).includes(new URL(r.link).hostname.replace(/^www\./,''))})),
    url: targetUrl,
    source: 'serpapi',
    position: match?.position ?? null,
    found: Boolean(match),
    resultUrl: match?.resultUrl ?? null,
    resultTitle: match?.resultTitle ?? null,
    searchCountry: country,
    searchLanguage: language,
    searchDepth: coveredDepth,
    requestedSearchDepth: searchDepth,
    resultsReturned,
  });

  const status = match ? `#${match.position}` : `not found in ${resultsReturned} returned organic results`;
  logger.info(`SEO ranking checked: "${normalizedKeyword}" — ${status}`);

  return ranking;
};

const runConfiguredRankingChecks = async (options = {}) => {
  if (!getSerpApiKey()) {
    throw new Error('SERP_API_KEY is not configured');
  }

  const store = options.store || require('../../services/seo/core').createStore(require('../middleware/database'));
  const settings = await store.settings();
  if (Ranking.db.readyState !== 1) throw Object.assign(new Error('Ranking history storage is unavailable.'), { code: 'RANKING_STORAGE_UNAVAILABLE' });
  const targetUrl = getRankingTargetUrl();
  const rankings = [];

  // Run sequentially to avoid bursting SerpAPI and to keep credit usage obvious.
  for (const keyword of getConfiguredKeywords()) {
    await store.reserve('serpapi',Number(settings.serp_daily_limit??10));
    rankings.push(await trackRanking(keyword, targetUrl));
  }

  return rankings;
};

module.exports = {
  getConfiguredKeywords,
  getRankingTargetUrl,
  runConfiguredRankingChecks,
  saveRanking: trackRanking,
  trackRanking,
};

const runManagedRankingChecks = async ({store,RankingModel=Ranking,tracker=trackRanking}) => {
 if(RankingModel.db?.readyState!==1)return {skipped:true,reason:'RANKING_STORAGE_UNAVAILABLE'};
 if(!getSerpApiKey())return {skipped:true,reason:'SERP_API_KEY_MISSING'};
 const settings=await store.settings(),limit=Math.min(Number(settings.serp_batch_size)||3,10),domains=(await store.query('SELECT domain FROM seo_competitors WHERE is_active')).rows.map(r=>r.domain);
 const keywords=(await store.query('SELECT * FROM seo_keywords WHERE is_active AND is_tracked AND next_check_at<=NOW() ORDER BY next_check_at,id LIMIT $1',[limit])).rows;
 let errors=0,checked=0;
 for(const row of keywords){try{await store.reserve('serpapi',Number(settings.serp_daily_limit??10));await tracker(row.keyword,row.target_url||getRankingTargetUrl(),{keywordId:row.id,country:row.country,language:row.language,location:row.location,competitorDomains:domains});await store.query("UPDATE seo_keywords SET last_checked_at=NOW(),last_error_code=NULL,next_check_at=NOW()+(frequency_hours::text||' hours')::interval WHERE id=$1",[row.id]);checked++;}catch(error){if(error.code==='PROVIDER_BUDGET_EXHAUSTED')break;await store.query("UPDATE seo_keywords SET last_error_code=$2,next_check_at=NOW()+INTERVAL '6 hours' WHERE id=$1",[row.id,error.code||'SERP_PROVIDER_FAILED']);errors++;}}
 return keywords.length?{checked,errors}:{skipped:true,reason:'NO_RANKINGS_DUE'};
};
module.exports.runManagedRankingChecks=runManagedRankingChecks;
