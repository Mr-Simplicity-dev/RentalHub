const LOCAL_FRONTEND_URL = 'http://localhost:3000';
const DEFAULT_PRODUCTION_FRONTEND_URL = 'https://rentalhub.com.ng';

const normalizeUrl = (url) => String(url).trim().replace(/\/+$/, '');

const isConfiguredUrl = (url) =>
  typeof url === 'string' && url.trim() && url.trim() !== '...';

const isSecureProductionOrigin = (url) => {
  if (process.env.NODE_ENV !== 'production') return true;
  if (process.env.ALLOW_INSECURE_CORS_ORIGINS === 'true') return true;
  return normalizeUrl(url).startsWith('https://');
};

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
        ...(process.env.NODE_ENV === 'production'
          ? []
          : [
              LOCAL_FRONTEND_URL,
              'http://127.0.0.1:3000',
              'http://localhost:5173',
              'http://127.0.0.1:5173',
              'http://localhost:4173',
              'http://127.0.0.1:4173',
            ]),
        'https://rentalhub.com.ng',
        'https://www.rentalhub.com.ng',
        process.env.FRONTEND_URL,
        process.env.PRODUCTION_FRONTEND_URL,
        ...(process.env.CORS_ALLOWED_ORIGINS || '').split(','),
      ]
        .filter(isConfiguredUrl)
        .map(normalizeUrl)
        .filter(isSecureProductionOrigin)
    )
  );

module.exports = {
  getAllowedFrontendOrigins,
  getFrontendUrl,
};
