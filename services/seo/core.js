const crypto = require('crypto');
const {
  canonicalUrl
} = require('../../config/utils/seoPolicy');
const fail = (status, code, message) => {
  throw Object.assign(new Error(message), {
    status,
    code
  });
};
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const id = () => crypto.randomUUID();
const day = value => {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) fail(400, 'INVALID_DATE', 'Use a valid date.');
  return s;
};
const shiftDay = (value, n) => new Date(Date.parse(day(value)) + n * 86400000).toISOString().slice(0, 10);
const range = (input = {}, maxDays = 90) => {
  const end = day(input.end || shiftDay(new Date().toISOString().slice(0, 10), -3)),
    start = day(input.start || shiftDay(end, -27));
  const length = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (length < 1 || length > maxDays || end > new Date().toISOString().slice(0, 10)) fail(400, 'INVALID_DATE_RANGE', `Choose up to ${maxDays} past days.`);
  return {
    start,
    end,
    length
  };
};
const createStore = db => {
  const query = async (sql, args = []) => {
    if (db.isMockActive?.()) fail(503, 'SEO_DATABASE_UNAVAILABLE', 'SEO data needs the real database.');
    try {
      const r = await db.query(sql, args);
      if (db.isMockActive?.()) fail(503, 'SEO_DATABASE_UNAVAILABLE', 'SEO data needs the real database.');
      return r;
    } catch (e) {
      if (e.code === '42P01') fail(503, 'SEO_MIGRATION_REQUIRED', 'Run the reviewed SEO database migration before using this feature.');
      throw e;
    }
  };
  const transaction = async fn => {
    const c = await db.connect();
    try {
      if (db.isMockActive?.()) fail(503, 'SEO_DATABASE_UNAVAILABLE', 'SEO data needs the real database.');
      await c.query('BEGIN');
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  };
  const settings = async () => (await query('SELECT config FROM seo_settings WHERE id=1')).rows[0]?.config || {};
  const observe = async (kind, subject, result, {
    actorId = null,
    cacheKey = null,
    ttlHours = 0,
    status = 'completed',
    errorCode = null
  } = {}) => {
    const key = id();
    await query("INSERT INTO seo_observations(id,kind,subject,result,status,error_code,requested_by,cache_key,expires_at) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,CASE WHEN $9::integer>0 THEN NOW()+($9::text||' hours')::interval ELSE NULL END)", [key, kind, subject, JSON.stringify(result), status, errorCode, actorId, cacheKey, ttlHours]);
    return {
      id: key,
      ...result
    };
  };
  const reserve = async (provider, limit) => {
    if (!Number.isInteger(limit) || limit < 1) fail(429, 'PROVIDER_BUDGET_EXHAUSTED', 'No provider requests are allowed by the current budget.');
    const r = await query(`INSERT INTO seo_provider_usage(provider,usage_date,used) VALUES($1,CURRENT_DATE,1) ON CONFLICT(provider,usage_date) DO UPDATE SET used=seo_provider_usage.used+1 WHERE seo_provider_usage.used<$2 RETURNING used`, [provider, limit]);
    if (!r.rows.length) fail(429, 'PROVIDER_BUDGET_EXHAUSTED', 'The daily request budget has been reached. Try tomorrow.');
    return r.rows[0].used;
  };
  return {
    query,
    transaction,
    settings,
    observe,
    reserve
  };
};
const providerError = (error, provider = 'google') => {
  const status = error.response?.status || error.status;
  const code = status === 401 || status === 403 ? 'PROVIDER_ACCESS_REQUIRED' : status === 429 ? 'PROVIDER_RATE_LIMIT' : 'PROVIDER_UNAVAILABLE';
  return Object.assign(new Error(code === 'PROVIDER_ACCESS_REQUIRED' ? 'Reconnect the provider and check account permissions.' : code === 'PROVIDER_RATE_LIMIT' ? 'Provider limit reached. Retry later.' : 'The provider did not complete the request. Retry later.'), {
    status: 502,
    code,
    provider
  });
};
module.exports = {
  fail,
  text,
  hash,
  id,
  day,
  shiftDay,
  range,
  createStore,
  providerError,
  canonicalUrl
};
