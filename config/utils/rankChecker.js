const Ranking = require('../models/Ranking');
const { getFrontendUrl } = require('./frontendUrl');
const {
  fetchOrganicResults,
  findTargetResult,
  getSerpApiKey,
} = require('./serpTracker');

const DEFAULT_KEYWORDS = ['houses for rent in ikeja'];
const MAX_CONFIGURED_KEYWORDS = 10;

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
  });
  const match = findTargetResult(
    organicResults,
    targetUrl,
    options.match || 'domain'
  );

  const ranking = await Ranking.create({
    keyword: normalizedKeyword,
    url: targetUrl,
    source: 'serpapi',
    position: match?.position ?? null,
    found: Boolean(match),
    resultUrl: match?.resultUrl ?? null,
    resultTitle: match?.resultTitle ?? null,
    searchCountry: country,
    searchLanguage: language,
    searchDepth,
  });

  const status = match ? `#${match.position}` : `not found in top ${searchDepth}`;
  console.log(`SEO ranking checked: "${normalizedKeyword}" — ${status}`);

  return ranking;
};

const runConfiguredRankingChecks = async () => {
  if (!getSerpApiKey()) {
    throw new Error('SERP_API_KEY is not configured');
  }

  const targetUrl = getRankingTargetUrl();
  const rankings = [];

  // Run sequentially to avoid bursting SerpAPI and to keep credit usage obvious.
  for (const keyword of getConfiguredKeywords()) {
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
