const resolveApiBaseUrl = (configured, { production = false } = {}) => {
  const value = String(configured || '').trim();
  if (!value) return '/api';
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url;
  try { url = new URL(value); } catch { throw new Error('REACT_APP_API_URL must be a relative path or an HTTP(S) URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REACT_APP_API_URL must use HTTP(S)');
  const host = url.hostname.toLowerCase();
  const loopback = host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '[::1]' || host === '[::]' || /^127\./.test(host);
  if (production && loopback) return '/api';
  return value;
};
module.exports = { resolveApiBaseUrl };
