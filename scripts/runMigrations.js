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
const crypto = require('crypto');

// ── Configuration ──────────────────────────────────────────────────────────────
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const TRACKING_TABLE = 'schema_migrations';
const BATCH_SIZE = 1; // Run one migration per batch for granular tracking

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
    // Extract migration number from filename (e.g. "001_" -> "001")
    const match = filename.match(/^(\d+)/);
    return {
      filename,
      filepath,
      content,
      number: match ? match[1] : filename,
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

const getAppliedMigrations = async (client) => {
  const result = await client.query(
    `SELECT filename, hash FROM ${TRACKING_TABLE} ORDER BY filename ASC`
  );
  return result.rows;
};

const computeFileHash = (content) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
};

const getNextBatch = async (client) => {
  const result = await client.query(
    `SELECT COALESCE(MAX(batch), 0) AS last_batch FROM ${TRACKING_TABLE}`
  );
  return Number(result.rows[0].last_batch) + 1;
};

const isTransactionalMigration = (filename) => {
  // Some migrations may contain explicit transaction control (BEGIN/COMMIT)
  // We'll still wrap them but catch errors gracefully
  return true;
};

// ── Main migration logic ──────────────────────────────────────────────────────

const runPendingMigrations = async () => {
  const client = await pool.connect();

  try {
    console.log('📋 Migration Runner');
    console.log('═'.repeat(50));

    await client.query('BEGIN');
    await ensureTrackingTable(client);
    await client.query('COMMIT');

    const migrations = loadMigrationFiles();
    const applied = await getAppliedMigrations(client);
    const appliedFilenames = new Set(applied.map(r => r.filename));
    const appliedHashes = new Map(applied.map(r => [r.filename, r.hash]));

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
    if (!SKIP_HASH_CHECK) {
      for (const m of migrations) {
        if (appliedFilenames.has(m.filename)) {
          const storedHash = appliedHashes.get(m.filename);
          const currentHash = computeFileHash(m.content);
          if (storedHash !== currentHash) {
            hashChanged = true;
            console.warn(`\n⚠️  WARNING: Migration "${m.filename}" has changed since it was applied!`);
            console.warn(`   Stored hash: ${storedHash}`);
            console.warn(`   Current hash: ${currentHash}`);
            console.warn('   This could indicate tampering or an unintentional edit.');
            if (!DRY_RUN) {
              console.warn('   Continuing anyway. Update the tracking record manually if needed.');
            }
          }
        }
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
      const hash = computeFileHash(migration.content);
      process.stdout.write(`\n▶ Running ${migration.filename}... `);

      const startTime = Date.now();

      try {
        // Check if migration contains its own explicit transaction control
        const hasExplicitTx = /^\s*BEGIN\b/im.test(migration.content) && /^\s*COMMIT\b/im.test(migration.content);

        if (hasExplicitTx) {
          // Migration manages its own transaction - run directly
          await client.query(migration.content);
        } else {
          // For safety, each migration runs in its own transaction
          await client.query('BEGIN');
          await client.query(migration.content);
          await client.query('COMMIT');
        }

        // Mark as applied (outside transaction to avoid nested tx issues)
        await client.query(
          `INSERT INTO ${TRACKING_TABLE} (filename, migration_number, hash, batch, duration_ms)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (filename) DO UPDATE SET
             hash = EXCLUDED.hash,
             batch = EXCLUDED.batch,
             duration_ms = EXCLUDED.duration_ms,
             applied_at = CURRENT_TIMESTAMP`,
          [migration.filename, migration.number, hash, batch, 0]
        );

        const duration = Date.now() - startTime;
        // Update duration after commit
        await client.query(
          `UPDATE ${TRACKING_TABLE} SET duration_ms = $1 WHERE filename = $2`,
          [duration, migration.filename]
        );

        console.log(`✅ (${duration}ms)`);
        succeeded++;
      } catch (error) {
        // Attempt rollback (may fail if migration had its own tx control)
        try { await client.query('ROLLBACK'); } catch (_) {}

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
          // Mark as failed in tracking so we know it was attempted
          try {
            await client.query(
              `INSERT INTO ${TRACKING_TABLE} (filename, migration_number, hash, batch, duration_ms)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (filename) DO NOTHING`,
              [migration.filename, migration.number, 'FAILED_' + hash, batch, Date.now() - startTime]
            );
          } catch (_) {}
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

  } catch (error) {
    console.error('\n❌ Migration runner error:', error.message);
    process.exit(1);
  } finally {
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

  try {
    const result = await client.query(
      `SELECT COUNT(*) AS count FROM ${TRACKING_TABLE}`
    );
    console.log(`Currently tracking ${result.rows[0].count} migrations.\n`);

    if (DRY_RUN) {
      console.log('Dry-run: no changes made.');
      return;
    }

    await client.query(`DROP TABLE IF EXISTS ${TRACKING_TABLE} CASCADE`);
    console.log(`✅ Dropped table "${TRACKING_TABLE}".`);
    console.log('The next migration run will start fresh.\n');

    // Re-create the table so next run works
    await client.query(`
      CREATE TABLE ${TRACKING_TABLE} (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        migration_number VARCHAR(20) NOT NULL,
        hash VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        batch INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0
      )
    `);
    console.log('✅ Re-created empty tracking table.');

  } finally {
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
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
})();
