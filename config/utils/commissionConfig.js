const db = require('../middleware/database');

let cache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000;

const _loadAll = async () => {
  const result = await db.query('SELECT key, value FROM commission_config');
  const map = {};
  for (const row of result.rows) {
    map[row.key] = parseFloat(row.value);
  }
  return map;
};

const getAll = async () => {
  if (cache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cache;
  }
  cache = await _loadAll();
  cacheTimestamp = Date.now();
  return cache;
};

const invalidateCache = () => {
  cache = null;
  cacheTimestamp = 0;
};

const get = async (key, defaultValue = null) => {
  const config = await getAll();
  return config[key] !== undefined ? config[key] : defaultValue;
};

const set = async (key, value, updatedBy = null) => {
  await db.query(
    `INSERT INTO commission_config (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
    [key, value, updatedBy]
  );
  invalidateCache();
};

const setMultiple = async (entries, updatedBy = null) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const { key, value } of entries) {
      await client.query(
        `INSERT INTO commission_config (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
        [key, value, updatedBy]
      );
    }
    await client.query('COMMIT');
    invalidateCache();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { getAll, get, set, setMultiple, invalidateCache };
