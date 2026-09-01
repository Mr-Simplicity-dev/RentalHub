/**
 * Shared IP geolocation + VPN/proxy detection used by the survey gate and the
 * local-rate registration payment check.
 */

const axios = require('axios');

const getClientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.ip || '')
    .split(',')[0]
    .trim();

const isLocalInternalIp = (ip) =>
  !ip ||
  ip === '127.0.0.1' ||
  ip === '::1' ||
  ip.startsWith('10.') ||
  ip.startsWith('192.168.') ||
  ip.startsWith('172.16.') ||
  ip.startsWith('::ffff:');

/**
 * Returns { country_code, proxy, hosting, vpn } or null when the IP is
 * internal or no provider could resolve it (fail-open for the caller).
 */
const getIpGeolocation = async (ip) => {
  if (isLocalInternalIp(ip)) return null;

  const providers = [
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    `https://ipwho.is/${encodeURIComponent(ip)}`,
  ];

  for (const url of providers) {
    try {
      const response = await axios.get(url, { timeout: 4000 });
      const data = response.data;
      if (data && (data.country_code || data.country)) {
        return {
          country_code: String(data.country_code || data.country).toUpperCase(),
          proxy: Boolean(data.proxy),
          hosting: Boolean(data.hosting || data.security?.is_hosting),
          vpn: Boolean(data.vpn || data.security?.is_vpn || data.security?.is_proxy),
        };
      }
    } catch {
      // try next provider
    }
  }
  return null;
};

module.exports = { getClientIp, getIpGeolocation, isLocalInternalIp };
