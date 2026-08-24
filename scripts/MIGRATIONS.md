# Database Migration System

## Overview

The unified migration runner (`scripts/runMigrations.js`) replaces the previous ad-hoc scripts:
- `run_migration.js`
- `run_fixed_transportation_migration.js`
- `run_simple_transportation_migration.js`
- `run_transportation_admin_migration.js`

All migrations live in `/migrations/` as numbered SQL files (e.g., `001_*.sql`, `002_*.sql`).

## How It Works

1. The runner creates a `schema_migrations` table in your database to track which migrations have been applied.
2. On each run, it compares the files in `/migrations/` against the tracking table.
3. Duplicate migration numbers are rejected before any schema change runs.
4. A PostgreSQL advisory lock prevents two migration processes from running concurrently.
5. Each unapplied migration and its `schema_migrations` record are committed atomically.
6. A canonical SHA-256 hash is stored, so LF/CRLF line-ending differences do not create false tampering warnings.
7. A genuine change to an applied migration stops the runner unless a reviewed operator explicitly uses `--skip-hash-check`.
8. A deployment is rejected when the database records an applied migration file that is missing from the release.

## Usage

```bash
# Run all pending migrations
npm run migrate

# See what would be run without executing
npm run migrate:dry-run

# Review the allowlisted historical checksum reconciliation
npm run migrate:reconcile

# Apply that reconciliation after its checks pass
npm run migrate:reconcile:apply

# Run from a specific migration onward
node scripts/runMigrations.js --file=045

# Show rollback info (manual rollback required)
npm run migrate:down

# Reset dry-run (does NOT undo migrations)
npm run migrate:reset

# An actual reset additionally requires the confirmation flag and, in
# production, ALLOW_MIGRATION_TRACKING_RESET=true.
node scripts/runMigrations.js --reset \
  --confirm-reset=RESET_SCHEMA_MIGRATION_TRACKING
```

## Creating a New Migration

1. Create a new SQL file in `/migrations/` with the next sequential number:
   ```
   migrations/066_your_feature_name.sql
   ```

2. Write idempotent SQL. Do not include `BEGIN;` or `COMMIT;`; the runner owns the transaction:
   ```sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS new_column VARCHAR(100);
   CREATE INDEX IF NOT EXISTS idx_users_new_column ON users(new_column);
   ```

3. Run the migration:
   ```bash
   npm run migrate
   ```

## Integrity

The runner detects if a previously-applied migration file has been modified and stops before
running pending work. Historical hashes produced with CRLF, LF or a UTF-8 BOM are accepted as
equivalent, while actual SQL changes still fail integrity verification.

Never edit or renumber a migration after it has been applied. Add a new forward migration instead.
The runner strips complete outer `BEGIN;`/`COMMIT;` wrappers from legacy files for compatibility,
then wraps their SQL and tracking record in one atomic transaction.

## Removing Old Scripts

The old runner scripts (`run_migration.js`, `run_fixed_transportation_migration.js`, etc.)
are kept for backward compatibility but should no longer be used. All migrations should
be run through the unified runner.
