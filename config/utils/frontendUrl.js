const LOCAL_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_PRODUCTION_FRONTEND_URL = 'https://rentalhub.com.ng';

const normalizeUrl = (url) => String(url).trim().replace(/\/+$/, '');

const isConfiguredUrl = (url) =>
  typeof url === 'string' && url.trim() && url.trim() !== '...';

const getConfiguredFrontendUrl = () => {
  const configuredUrl =
    process.env.NODE_ENV === 'production'
      ? process.env.PRODUCTION_FRONTEND_URL || process.env.FRONTEND_URL
      : process.env.FRONTEND_URL;

  return isConfiguredUrl(configuredUrl) ? normalizeUrl(configuredUrl) : null;
};

const getDefaultFrontendUrl = () =>
  normalizeUrl(
    process.env.NODE_ENV === 'production'
      ? process.env.PRODUCTION_FRONTEND_URL || DEFAULT_PRODUCTION_FRONTEND_URL
      : LOCAL_FRONTEND_URL
  );

const getFrontendUrl = (origin) => {
  const configuredUrl = getConfiguredFrontendUrl();

  if (configuredUrl) {
    return configuredUrl;
  }

  if (isConfiguredUrl(origin)) {
    return normalizeUrl(origin);
  }

  return getDefaultFrontendUrl();
};

const getAllowedFrontendOrigins = () =>
  Array.from(
    new Set(
      [
        LOCAL_FRONTEND_URL,
        'http://127.0.0.1:3000',
        'http://rentalhub.com.ng',
        'https://rentalhub.com.ng',
        'http://www.rentalhub.com.ng',
        'https://www.rentalhub.com.ng',
        process.env.FRONTEND_URL,
        process.env.PRODUCTION_FRONTEND_URL,
        ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
      ]
        .filter(isConfiguredUrl)
        .map(normalizeUrl)
    )
  );

module.exports = {
  getAllowedFrontendOrigins,
  getFrontendUrl,
};
