/**
 * FX rate utilities for diaspora (USD-quoted) registration payments.
 *
 * Paystack settles in NGN, so a USD-priced diaspora fee is converted at quote
 * time using the best available rate:
 *   1. Cached rate in fx_rates (fresh within FX_RATE_TTL_MS)
 *   2. Live rate fetched from FX_RATE_API_URL (open.er-api.com, no key) when
 *      FX_AUTO_REFRESH is enabled (default)
 *   3. Manual USD_TO_NGN_RATE env fallback
 *
 * A diaspora_fx_markup_pct app setting (default 2%) is applied before the
 * final naira amount is rounded up, so the platform never loses on FX.
 */

const axios = require('axios');
const db = require('../middleware/database');

const FX_RATE_API_URL =
  process.env.FX_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
const FX_AUTO_REFRESH = process.env.FX_AUTO_REFRESH !== 'false';
const FX_RATE_TTL_MS = Math.max(
  Number(process.env.FX_RATE_TTL_MS) || 6 * 60 * 60 * 1000,
  60000
);
const MANUAL_RATE = Number(process.env.USD_TO_NGN_RATE);

const ensureFxSchema = (() => {
  let ready = false;
  return async () => {
    if (ready) return;
    await db.query(`
      CREATE TABLE IF NOT EXISTS fx_rates (
        currency_from VARCHAR(3) NOT NULL,
        currency_to VARCHAR(3) NOT NULL,
        rate DECIMAL(18,6) NOT NULL,
        source VARCHAR(40) NOT NULL DEFAULT 'manual',
        fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (currency_from, currency_to)
      );
    `);
    ready = true;
  };
})();

const getStoredFxRate = async () => {
  await ensureFxSchema();
  const result = await db.query(
    `SELECT rate, source, fetched_at
     FROM fx_rates
     WHERE currency_from = 'USD' AND currency_to = 'NGN'`
  );
  return result.rows[0] || null;
};

const upsertFxRate = async ({ rate, source }) => {
  await ensureFxSchema();
  await db.query(
    `INSERT INTO fx_rates (currency_from, currency_to, rate, source, fetched_at)
     VALUES ('USD', 'NGN', $1, $2, CURRENT_TIMESTAMP)
     ON CONFLICT (currency_from, currency_to) DO UPDATE SET
       rate = EXCLUDED.rate,
       source = EXCLUDED.source,
       fetched_at = CURRENT_TIMESTAMP`,
    [rate, source]
  );
};

const fetchLiveRate = async () => {
  const response = await axios.get(FX_RATE_API_URL, { timeout: 10000 });
  const ngn = response.data?.rates?.NGN;
  if (!Number.isFinite(Number(ngn))) {
    throw new Error('FX API response missing NGN rate');
  }
  return Number(ngn);
};

const refreshFxRate = async () => {
  if (!FX_AUTO_REFRESH) return null;
  try {
    const rate = await fetchLiveRate();
    await upsertFxRate({ rate, source: 'open.er-api.com' });
    return rate;
  } catch (error) {
    console.warn('FX auto-refresh failed:', error.message);
    return null;
  }
};

const getUsdToNgnRate = async () => {
  const stored = await getStoredFxRate();

  if (stored) {
    const ageMs = Date.now() - new Date(stored.fetched_at).getTime();
    if (ageMs < FX_RATE_TTL_MS) {
      return Number(stored.rate);
    }
  }

  const live = await refreshFxRate();
  if (live) return live;

  if (stored) return Number(stored.rate);

  if (Number.isFinite(MANUAL_RATE) && MANUAL_RATE > 0) {
    return MANUAL_RATE;
  }

  throw new Error(
    'No USD→NGN rate available. Set USD_TO_NGN_RATE or enable FX_AUTO_REFRESH.'
  );
};

const getDiasporaMarkupPct = async () => {
  await ensureFxSchema();
  const result = await db.query(
    `SELECT value FROM app_settings WHERE key = 'diaspora_fx_markup_pct'`
  );
  const configured =
    Number(result.rows[0]?.value?.value) ||
    Number(process.env.DIASPORA_FX_MARKUP_PCT) ||
    2;
  return Math.max(0, Math.min(configured, 25));
};

/**
 * Pure conversion math: usd * rate * (1 + markupPct/100), rounded UP to the
 * nearest whole naira. Kept pure for unit testing.
 */
const convertUsdToNgn = (usdAmount, rate, markupPct = 0) => {
  const usd = Number(usdAmount);
  const fxRate = Number(rate);
  const markup = Number(markupPct);

  if (!Number.isFinite(usd) || usd <= 0) {
    throw new Error('USD amount must be greater than zero');
  }
  if (!Number.isFinite(fxRate) || fxRate <= 0) {
    throw new Error('FX rate must be greater than zero');
  }

  return Math.ceil(usd * fxRate * (1 + markup / 100));
};

const usdToNgn = async (usdAmount) => {
  const rate = await getUsdToNgnRate();
  const markupPct = await getDiasporaMarkupPct();
  return convertUsdToNgn(usdAmount, rate, markupPct);
};

module.exports = {
  convertUsdToNgn,
  fetchLiveRate,
  getDiasporaMarkupPct,
  getUsdToNgnRate,
  refreshFxRate,
  usdToNgn,
};
