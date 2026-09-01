/**
 * Shared IP geolocation + VPN/proxy detection used by the survey gate and the
 * local-rate registration payment check.
 *
 * False positives on Nigerian mobile/ISP IPs are common with single geo
 * providers, so callers should use getIpVerdicts() and only BLOCK when ALL
 * available providers agree (fail-open on disagreement).
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
 * Query a single provider. Returns { country_code, proxy, hosting, vpn }
 * or null when the IP is internal or the provider failed.
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

/**
 * Query ALL providers and return every verdict (or [] when none resolved).
 * Blocking logic should require agreement across all returned verdicts.
 */
const getIpVerdicts = async (ip) => {
  if (isLocalInternalIp(ip)) return [];

  const verdicts = [];
  const providers = [
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    `https://ipwho.is/${encodeURIComponent(ip)}`,
  ];

  for (const url of providers) {
    try {
      const response = await axios.get(url, { timeout: 4000 });
      const data = response.data;
      if (data && (data.country_code || data.country)) {
        verdicts.push({
          country_code: String(data.country_code || data.country).toUpperCase(),
          proxy: Boolean(data.proxy),
          hosting: Boolean(data.hosting || data.security?.is_hosting),
          vpn: Boolean(data.vpn || data.security?.is_vpn || data.security?.is_proxy),
        });
      }
    } catch {
      // skip this provider
    }
  }
  return verdicts;
};

module.exports = { getClientIp, getIpGeolocation, getIpVerdicts, isLocalInternalIp };
