/**
 * One-time, audited reconciliation for two historical migrations whose exact
 * applied files are no longer recoverable. This script is deliberately
 * allowlisted: it cannot approve arbitrary migration hash changes.
 *
 * Dry run:
 *   npm run migrate:reconcile
 *
 * Apply:
 *   npm run migrate:reconcile -- --apply
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const {
  computeCanonicalMigrationHash,
  isStoredMigrationHashCompatible,
} = require('./migrationIntegrity');

const APPLY = process.argv.slice(2).includes('--apply');
const MIGRATION_LOCK_KEY = 'rentalhub:schema-migrations';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const RECONCILIATIONS = [
  {
    filename: '013_lawyer_case_notes.sql',
    storedHash: '885d86811fb6b231b289619a684feadc76b1e749e61235558e57a8d3c1c7a727',
    reviewedHash: 'be2805168d9e3df114643e61578b28fe685cae59f0a2c8494947ecf608e509ea',
    reason: 'Restored the lawyer migration and moved transportation setup to forward migration 031a.',
    verify: async (client) => {
      const result = await client.query(`
        SELECT
          to_regclass('public.lawyer_case_notes') IS NOT NULL AS notes_table,
          COUNT(*) FILTER (
            WHERE table_name = 'disputes'
              AND column_name IN ('lawyer_summary', 'lawyer_summary_by', 'lawyer_summary_at')
          )::int AS summary_columns
        FROM information_schema.columns
        WHERE table_schema = 'public'
      `);

      if (!result.rows[0]?.notes_table || result.rows[0]?.summary_columns !== 3) {
        throw new Error('Migration 013 schema verification failed');
      }
    },
  },
  {
    filename: '062_seed_recruitment_questions.sql',
    storedHash: 'b6ec4196962a9feef87dde2688977f2e453b402920168df2d0ee6e2b9101beeb',
    reviewedHash: '09642f033d62492a13ad0ff5a5c03e41fb5366795bfc16643ef102b357a30544',
    reason: 'Verified the committed 500-question seed and the populated production question bank.',
    verify: async (client) => {
      const result = await client.query(`
        SELECT COUNT(*)::int AS active_questions
        FROM recruitment_questions
        WHERE is_active = TRUE
      `);

      if ((result.rows[0]?.active_questions || 0) < 500) {
        throw new Error('Migration 062 data verification failed: fewer than 500 active questions');
      }
    },
  },
];

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : false,
  connectionTimeoutMillis: 15000,
});

const validateReviewedFiles = () => {
  for (const item of RECONCILIATIONS) {
    const filepath = path.join(MIGRATIONS_DIR, item.filename);
    const content = fs.readFileSync(filepath, 'utf8');
    const actualHash = computeCanonicalMigrationHash(content);
    if (actualHash !== item.reviewedHash) {
      throw new Error(
        `${item.filename} no longer matches its reviewed reconciliation hash`
      );
    }
  }
};

const getCompatibleLegacyHashes = async (client) => {
  const tracked = await client.query(
    'SELECT filename, hash FROM schema_migrations FOR UPDATE'
  );
  const storedByFilename = new Map(
    tracked.rows.map((row) => [row.filename, row.hash])
  );
  const compatible = [];

  for (const filename of fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql'))) {
    const storedHash = storedByFilename.get(filename);
    if (!storedHash) continue;

    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const canonicalHash = computeCanonicalMigrationHash(content);
    if (
      storedHash !== canonicalHash &&
      isStoredMigrationHashCompatible(storedHash, content)
    ) {
      compatible.push({
        filename,
        storedHash,
        canonicalHash,
        reason: 'Canonicalized a legacy checksum that differed only by line endings or a UTF-8 BOM.',
      });
    }
  }

  return compatible;
};

const ensureAuditTable = (client) => client.query(`
  CREATE TABLE IF NOT EXISTS schema_migration_hash_reconciliations (
    id BIGSERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    previous_hash VARCHAR(64) NOT NULL,
    reconciled_hash VARCHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(filename, previous_hash, reconciled_hash)
  )
`);

const run = async () => {
  validateReviewedFiles();
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    const lock = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [MIGRATION_LOCK_KEY]
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) throw new Error('Another migration process is already running');

    await client.query('BEGIN');
    await client.query('LOCK TABLE schema_migrations IN SHARE ROW EXCLUSIVE MODE');

    const planned = [];
    for (const item of RECONCILIATIONS) {
      const result = await client.query(
        'SELECT hash FROM schema_migrations WHERE filename = $1 FOR UPDATE',
        [item.filename]
      );
      if (!result.rows.length) {
        throw new Error(`${item.filename} is not recorded as applied`);
      }

      const currentHash = result.rows[0].hash;
      if (currentHash === item.reviewedHash) {
        planned.push({ filename: item.filename, status: 'already reconciled' });
        continue;
      }
      if (currentHash !== item.storedHash) {
        throw new Error(
          `${item.filename} has an unexpected stored hash; refusing reconciliation`
        );
      }

      await item.verify(client);
      planned.push({ filename: item.filename, status: 'verified', reason: item.reason });
    }
    const compatibleLegacyHashes = await getCompatibleLegacyHashes(client);

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({
        mode: 'dry-run',
        reconciliations: planned,
        compatibleLegacyHashes: compatibleLegacyHashes.length,
      }, null, 2));
      return;
    }

    await ensureAuditTable(client);
    for (const item of RECONCILIATIONS) {
      const result = await client.query(
        'SELECT hash FROM schema_migrations WHERE filename = $1 FOR UPDATE',
        [item.filename]
      );
      if (result.rows[0]?.hash === item.reviewedHash) continue;

      await client.query(
        `INSERT INTO schema_migration_hash_reconciliations (
           filename, previous_hash, reconciled_hash, reason
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (filename, previous_hash, reconciled_hash) DO NOTHING`,
        [item.filename, item.storedHash, item.reviewedHash, item.reason]
      );
      await client.query(
        'UPDATE schema_migrations SET hash = $2 WHERE filename = $1 AND hash = $3',
        [item.filename, item.reviewedHash, item.storedHash]
      );
    }

    for (const item of compatibleLegacyHashes) {
      await client.query(
        `INSERT INTO schema_migration_hash_reconciliations (
           filename, previous_hash, reconciled_hash, reason
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (filename, previous_hash, reconciled_hash) DO NOTHING`,
        [item.filename, item.storedHash, item.canonicalHash, item.reason]
      );
      await client.query(
        'UPDATE schema_migrations SET hash = $2 WHERE filename = $1 AND hash = $3',
        [item.filename, item.canonicalHash, item.storedHash]
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({
      mode: 'applied',
      reconciliations: planned,
      compatibleLegacyHashes: compatibleLegacyHashes.length,
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (lockAcquired) {
      await client.query(
        'SELECT pg_advisory_unlock(hashtext($1))',
        [MIGRATION_LOCK_KEY]
      ).catch(() => {});
    }
    client.release();
    await pool.end();
  }
};

run().catch((error) => {
  console.error(`Migration hash reconciliation failed: ${error.message}`);
  process.exitCode = 1;
});
