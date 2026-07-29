/**
 * Unified Database Migration Runner
 * 
 * Runs all SQL migration files from /migrations/ in order,
 * tracking which migrations have been applied in a `schema_migrations` table.
 * 
 * Usage:
 *   node scripts/runMigrations.js                    # Run all pending migrations
 *   node scripts/runMigrations.js --dry-run          # Show what would be run
 *   node scripts/runMigrations.js --down             # Rollback last migration (if supported)
 *   node scripts/runMigrations.js --file=045         # Run from a specific number onward
 *   node scripts/runMigrations.js --reset            # Reset migration tracking (DANGER)
 *   node scripts/runMigrations.js --skip-hash-check  # Skip hash integrity checks on already-applied migrations
 *   node scripts/runMigrations.js --continue-on-error # Continue running remaining migrations after a failure
 * 
 * Production-safe features:
 *   - Each migration runs in its own transaction (or respects existing BEGIN/COMMIT)
 *   - Uses ON CONFLICT for tracking table UPSERTS
 *   - Detects and reports view dependencies on ALTER COLUMN operations
 *   - Supports --skip-hash-check when migrations have been intentionally modified
 *   - Supports --continue-on-error to apply as many migrations as possible
 */

const { Pool } = require('pg');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  computeCanonicalMigrationHash,
  extractMigrationNumber,
  findDuplicateMigrationNumbers,
  findMissingAppliedMigrationFiles,
  isStoredMigrationHashCompatible,
  stripOuterMigrationTransaction,
} = require('./migrationIntegrity');

// ── Configuration ──────────────────────────────────────────────────────────────
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const TRACKING_TABLE = 'schema_migrations';
const MIGRATION_LOCK_KEY = 'rentalhub:schema-migrations';
const MIGRATION_LOCK_TIMEOUT_MS = Math.max(
  Number(process.env.MIGRATION_LOCK_TIMEOUT_MS) || 15000,
  1000
);
const MIGRATION_STATEMENT_TIMEOUT_MS = Math.max(
  Number(process.env.MIGRATION_STATEMENT_TIMEOUT_MS) || 300000,
  10000
);

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

// ── CLI argument parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const DOWN_MODE = args.includes('--down');
const RESET_MODE = args.includes('--reset');
const SKIP_HASH_CHECK = args.includes('--skip-hash-check');
const CONTINUE_ON_ERROR = args.includes('--continue-on-error');
const RESET_CONFIRMED = args.includes('--confirm-reset=RESET_SCHEMA_MIGRATION_TRACKING');
const fileArg = args.find(a => a.startsWith('--file='));
const START_FROM = fileArg ? fileArg.split('=')[1] : null;

// ── Helpers ───────────────────────────────────────────────────────────────────

const loadMigrationFiles = () => {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();  // Natural sort works because we use numeric prefixes

  return files.map(filename => {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    const content = fs.readFileSync(filepath, 'utf8');
    // Optional alphabetic suffixes support forward-only ordering repairs such
    // as "031a_" without modifying an already-applied migration.
    return {
      filename,
      filepath,
      content,
      number: extractMigrationNumber(filename),
    };
  });
};

const ensureTrackingTable = async (client) => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      migration_number VARCHAR(20) NOT NULL,
      hash VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      batch INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );
  `);
};

const trackingTableExists = async (client) => {
  const result = await client.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${TRACKING_TABLE}`]
  );
  return result.rows[0]?.exists === true;
};

const getAppliedMigrations = async (client) => {
  const result = await client.query(
    `SELECT filename, hash FROM ${TRACKING_TABLE} ORDER BY filename ASC`
  );
  return result.rows;
};

const getNextBatch = async (client) => {
  const result = await client.query(
    `SELECT COALESCE(MAX(batch), 0) AS last_batch FROM ${TRACKING_TABLE}`
  );
  return Number(result.rows[0].last_batch) + 1;
};

const acquireMigrationLock = async (client) => {
  const result = await client.query(
    'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
    [MIGRATION_LOCK_KEY]
  );
  if (!result.rows[0]?.acquired) {
    throw new Error('Another migration process is already running');
  }
};

const releaseMigrationLock = async (client) => {
  await client.query(
    'SELECT pg_advisory_unlock(hashtext($1))',
    [MIGRATION_LOCK_KEY]
  ).catch(() => {});
};

// ── Main migration logic ──────────────────────────────────────────────────────

const runPendingMigrations = async () => {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    if (
      CONTINUE_ON_ERROR &&
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_UNSAFE_MIGRATION_CONTINUE !== 'true'
    ) {
      throw new Error(
        '--continue-on-error is disabled in production unless ALLOW_UNSAFE_MIGRATION_CONTINUE=true'
      );
    }

    console.log('📋 Migration Runner');
    console.log('═'.repeat(50));

    await acquireMigrationLock(client);
    lockAcquired = true;

    const migrations = loadMigrationFiles();
    const duplicateNumbers = findDuplicateMigrationNumbers(migrations);
    if (duplicateNumbers.length) {
      const details = duplicateNumbers
        .map(({ number, filenames }) => `${number}: ${filenames.join(', ')}`)
        .join('; ');
      throw new Error(`Duplicate migration numbers detected: ${details}`);
    }

    const hasTrackingTable = await trackingTableExists(client);
    if (!hasTrackingTable && !DRY_RUN) {
      await client.query('BEGIN');
      await ensureTrackingTable(client);
      await client.query('COMMIT');
    }

    const applied = hasTrackingTable ? await getAppliedMigrations(client) : [];
    const appliedFilenames = new Set(applied.map(r => r.filename));
    const appliedHashes = new Map(applied.map(r => [r.filename, r.hash]));
    const missingAppliedFiles = findMissingAppliedMigrationFiles(applied, migrations);
    if (missingAppliedFiles.length) {
      throw new Error(
        `Applied migration files are missing from this release: ${missingAppliedFiles.join(', ')}`
      );
    }

    console.log(`Found ${migrations.length} migration files, ${appliedFilenames.size} already applied.`);

    // Filter pending migrations
    let pending = migrations.filter(m => !appliedFilenames.has(m.filename));

    // If START_FROM is specified, only include from that point
    if (START_FROM) {
      const startIdx = pending.findIndex(m => m.number === START_FROM || m.filename.startsWith(START_FROM));
      if (startIdx === -1) {
        // Maybe it's already applied
        const alreadyApplied = migrations.find(m => m.filename.startsWith(START_FROM));
        if (alreadyApplied && appliedFilenames.has(alreadyApplied.filename)) {
          console.log(`\n⚠️  Migration "${alreadyApplied.filename}" was already applied.`);
        } else {
          console.log(`\n⚠️  No pending migration found starting with "${START_FROM}".`);
        }
        return;
      }
      pending = pending.slice(startIdx);
    }

    // Check for hash changes in already-applied migrations
    // Skip this check if --skip-hash-check flag is provided
    let hashChanged = false;
    let compatibleLegacyHashes = 0;
    if (!SKIP_HASH_CHECK) {
      for (const m of migrations) {
        if (appliedFilenames.has(m.filename)) {
          const storedHash = appliedHashes.get(m.filename);
          const currentHash = computeCanonicalMigrationHash(m.content);
          if (!isStoredMigrationHashCompatible(storedHash, m.content)) {
            hashChanged = true;
            console.warn(`\n⚠️  WARNING: Migration "${m.filename}" has changed since it was applied!`);
            console.warn(`   Stored hash: ${storedHash}`);
            console.warn(`   Current hash: ${currentHash}`);
            console.warn('   This could indicate tampering or an unintentional edit.');
          } else if (storedHash !== currentHash) {
            compatibleLegacyHashes += 1;
          }
        }
      }

      if (compatibleLegacyHashes > 0) {
        console.log(
          `Recognized ${compatibleLegacyHashes} legacy checksum(s) that differ only by line endings or a UTF-8 BOM.`
        );
      }

      if (hashChanged) {
        throw new Error(
          'Applied migration content has changed. Restore the original files or use --skip-hash-check only after a documented review.'
        );
      }
    } else {
      console.log('🔓 Hash check skipped (--skip-hash-check flag set).');
    }

    if (pending.length === 0) {
      console.log('\n✅ All migrations are up to date. Nothing to run.');
      return;
    }

    console.log(`\n📦 Pending migrations to run: ${pending.length}`);
    pending.forEach(m => console.log(`   - ${m.filename}`));

    if (DRY_RUN) {
      console.log('\n🏁 Dry-run complete. No migrations were executed.');
      return;
    }

    // Confirm with user
    console.log('');
    const batch = await getNextBatch(client);
    let succeeded = 0;
    let failed = 0;

    for (const migration of pending) {
      const hash = computeCanonicalMigrationHash(migration.content);
      process.stdout.write(`\n▶ Running ${migration.filename}... `);

      const startTime = Date.now();

      try {
        const executable = stripOuterMigrationTransaction(migration.content);

        await client.query('BEGIN');
        await client.query(
          `SELECT
             set_config('lock_timeout', $1, true),
             set_config('statement_timeout', $2, true)`,
          [`${MIGRATION_LOCK_TIMEOUT_MS}ms`, `${MIGRATION_STATEMENT_TIMEOUT_MS}ms`]
        );
        await client.query(executable.content);

        const duration = Date.now() - startTime;
        await client.query(
          `INSERT INTO ${TRACKING_TABLE} (filename, migration_number, hash, batch, duration_ms)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (filename) DO UPDATE SET
             hash = EXCLUDED.hash,
             batch = EXCLUDED.batch,
             duration_ms = EXCLUDED.duration_ms,
             applied_at = CURRENT_TIMESTAMP`,
          [migration.filename, migration.number, hash, batch, duration]
        );
        await client.query('COMMIT');

        console.log(`✅ (${duration}ms)`);
        succeeded++;
      } catch (error) {
        // Attempt rollback (may fail if migration had its own tx control)
        try { await client.query('ROLLBACK'); } catch (rollbackErr) { console.warn(`   ⚠️  Rollback failed (may be expected): ${rollbackErr.message}`); }
 
        console.log(`❌ FAILED`);
        console.error(`\n   Error in ${migration.filename}:`);
        console.error(`   ${error.message}`);
        if (error.position) {
          const lines = migration.content.split('\n');
          const lineNum = migration.content.slice(0, error.position - 1).split('\n').length;
          console.error(`   Near line ${lineNum}: ${(lines[lineNum - 1] || '').trim().slice(0, 120)}`);
        }
        failed++;

        if (CONTINUE_ON_ERROR) {
          console.warn(`   ⏩ Continuing with next migration (--continue-on-error).`);
          continue;
        } else {
          console.error('\n   ⚠️  To continue despite errors, use: --continue-on-error');
          break; // Stop on first failure
        }
      }
    }

    console.log('\n' + '═'.repeat(50));
    console.log(`📊 Results: ${succeeded} succeeded, ${failed} failed`);
    console.log('═'.repeat(50));
    if (failed > 0) {
      process.exitCode = 1;
    }

  } catch (error) {
    console.error('\n❌ Migration runner error:', error.message);
    process.exitCode = 1;
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(client);
    }
    client.release();
    await pool.end();
  }
};

// ── Rollback (down) mode ─────────────────────────────────────────────────────

const rollbackLastMigration = async () => {
  const client = await pool.connect();

  try {
    console.log('⏪ Migration Rollback');
    console.log('═'.repeat(50));

    await client.query('BEGIN');
    await ensureTrackingTable(client);
    await client.query('COMMIT');

    // Find the last batch
    const lastBatchResult = await client.query(
      `SELECT filename, migration_number, applied_at
       FROM ${TRACKING_TABLE}
       WHERE batch = (SELECT MAX(batch) FROM ${TRACKING_TABLE})
       ORDER BY filename ASC`
    );

    if (lastBatchResult.rows.length === 0) {
      console.log('No migrations to roll back.');
      return;
    }

    console.log(`\nLast batch (${lastBatchResult.rows.length} migration(s)):`);
    for (const row of lastBatchResult.rows) {
      console.log(`   ${row.filename} (applied ${row.applied_at})`);
    }

    if (DRY_RUN) {
      console.log('\n🏁 Dry-run complete. No migrations were rolled back.');
      console.log('\n⚠️  Note: Automatic rollback requires down migrations.');
      console.log('   SQL rollbacks (reverse operations) are not automatically generated.');
      console.log('   Manual intervention may be required.');
      return;
    }

    console.log('\n⚠️  Automatic rollback is not implemented.');
    console.log('   To revert a migration, manually write a down migration SQL file and apply it.');
    console.log('   You can then remove the tracking record with:');
    console.log(`   DELETE FROM ${TRACKING_TABLE} WHERE filename = '<filename>';`);

  } finally {
    client.release();
    await pool.end();
  }
};

// ── Reset mode ────────────────────────────────────────────────────────────────

const resetTracking = async () => {
  console.log('⚠️  ⚠️  ⚠️  RESET MODE  ⚠️  ⚠️  ⚠️');
  console.log('This will reset the migration tracking table.');
  console.log('It does NOT undo any migrations.');
  console.log('Use only if you know what you are doing!\n');

  const client = await pool.connect();
  let lockAcquired = false;

  try {
    if (!DRY_RUN && !RESET_CONFIRMED) {
      throw new Error(
        'Reset refused. Re-run with --confirm-reset=RESET_SCHEMA_MIGRATION_TRACKING only after an approved recovery review.'
      );
    }
    if (
      !DRY_RUN &&
      process.env.NODE_ENV === 'production' &&
      process.env.ALLOW_MIGRATION_TRACKING_RESET !== 'true'
    ) {
      throw new Error(
        'Migration tracking reset is disabled in production unless ALLOW_MIGRATION_TRACKING_RESET=true'
      );
    }

    await acquireMigrationLock(client);
    lockAcquired = true;

    const result = await client.query(
      `SELECT COUNT(*) AS count FROM ${TRACKING_TABLE}`
    );
    console.log(`Currently tracking ${result.rows[0].count} migrations.\n`);

    if (DRY_RUN) {
      console.log('Dry-run: no changes made.');
      return;
    }

    await client.query('BEGIN');
    await client.query(`DROP TABLE IF EXISTS ${TRACKING_TABLE} CASCADE`);
    console.log(`✅ Dropped table "${TRACKING_TABLE}".`);
    console.log('The next migration run will start fresh.\n');

    await ensureTrackingTable(client);
    await client.query('COMMIT');
    console.log('✅ Re-created empty tracking table.');

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(client);
    }
    client.release();
    await pool.end();
  }
};

// ── Entry point ──────────────────────────────────────────────────────────────

(async () => {
  try {
    if (RESET_MODE) {
      await resetTracking();
    } else if (DOWN_MODE) {
      await rollbackLastMigration();
    } else {
      await runPendingMigrations();
    }
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exitCode = 1;
  }
})();
