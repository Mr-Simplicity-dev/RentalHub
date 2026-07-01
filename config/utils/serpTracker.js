const axios = require('axios');

const SERP_API_URL = 'https://serpapi.com/search.json';

const getSerpApiKey = () => {
  const value = process.env.SERP_API_KEY;
  return typeof value === 'string' && value.trim() && value.trim() !== '...'
    ? value.trim()
    : null;
};

const normalizeHostname = (value) => {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

const normalizeComparableUrl = (value) => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${hostname}${pathname}`;
  } catch {
    return null;
  }
};

/**
 * Find the target site in Google's organic results.
 * Domain matching is the default because Google may rank a different RentalHub
 * landing page than the one originally expected for a keyword.
 */
const findTargetResult = (organicResults, targetUrl, match = 'domain') => {
  const targetHostname = normalizeHostname(targetUrl);
  const targetComparableUrl = normalizeComparableUrl(targetUrl);

  if (!targetHostname) {
    throw new Error('A valid SEO ranking target URL is required');
  }

  const results = Array.isArray(organicResults) ? organicResults : [];
  const result = results.find((item) => {
    if (!item?.link) return false;

    if (match === 'exact') {
      return normalizeComparableUrl(item.link) === targetComparableUrl;
    }

    return normalizeHostname(item.link) === targetHostname;
  });

  if (!result) return null;

  const fallbackPosition = results.indexOf(result) + 1;
  const parsedPosition = Number(result.position);

  return {
    position:
      Number.isInteger(parsedPosition) && parsedPosition > 0
        ? parsedPosition
        : fallbackPosition,
    resultUrl: result.link,
    resultTitle: result.title || null,
  };
};

const fetchOrganicResults = async (keyword, options = {}) => {
  const apiKey = getSerpApiKey();
  if (!apiKey) {
    throw new Error('SERP_API_KEY is not configured');
  }

  const searchDepth = Math.min(
    Math.max(Number(options.searchDepth) || 100, 10),
    100
  );

  try {
    const response = await axios.get(SERP_API_URL, {
      params: {
        engine: 'google',
        q: keyword,
        hl: options.language || 'en',
        gl: options.country || 'ng',
        num: searchDepth,
        api_key: apiKey,
      },
      timeout: 15000,
    });

    return Array.isArray(response.data?.organic_results)
      ? response.data.organic_results
      : [];
  } catch (error) {
    if (error.response?.status === 401) {
      throw new Error('SERP_API_KEY is missing or invalid');
    }

    const providerMessage = error.response?.data?.error;
    if (providerMessage) {
      throw new Error(`SerpAPI request failed: ${providerMessage}`);
    }

    throw error;
  }
};

// Kept as an alias for callers that only need the raw organic result list.
const checkRanking = fetchOrganicResults;

module.exports = {
  checkRanking,
  fetchOrganicResults,
  findTargetResult,
  getSerpApiKey,
  normalizeHostname,
};
