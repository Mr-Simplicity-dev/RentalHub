const {
  getFrontendUrl
} = require('./frontendUrl');
const escapeXml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const publicPath = pathname => pathname === '/' || /^\/(?:properties(?:\/\d+)?|nigeria(?:\/[a-z0-9_-]+){0,2}|areas(?:\/[a-z0-9_-]+){3}|blog\/[a-z0-9_-]+|landlord-guide|careers|legal-cases)\/?$/.test(pathname);
const canonicalUrl = (value, origin = getFrontendUrl()) => {
  const base = new URL(origin);
  const url = new URL(String(value || ''), base);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password || !publicPath(url.pathname) || url.search || /%|\\/.test(url.pathname)) throw Object.assign(new Error('Choose a public RentalHub page.'), {
    status: 400,
    code: 'INVALID_PUBLIC_URL'
  });
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
};
module.exports = {
  escapeXml,
  safeJson,
  publicPath,
  canonicalUrl
};
