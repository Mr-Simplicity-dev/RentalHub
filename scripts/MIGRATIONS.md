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
3. Any unapplied migrations are run in order, each in its own transaction.
4. After successful application, a record is inserted into `schema_migrations`.
5. The SHA-256 hash of each migration file is stored for integrity verification.

## Usage

```bash
# Run all pending migrations
npm run migrate

# See what would be run without executing
npm run migrate:dry-run

# Run from a specific migration onward
node scripts/runMigrations.js --file=045

# Show rollback info (manual rollback required)
npm run migrate:down

# Reset tracking table (does NOT undo migrations)
npm run migrate:reset
```

## Creating a New Migration

1. Create a new SQL file in `/migrations/` with the next sequential number:
   ```
   migrations/066_your_feature_name.sql
   ```

2. Write your SQL. Include `BEGIN;` and `COMMIT;` for multi-statement migrations:
   ```sql
   BEGIN;
   ALTER TABLE users ADD COLUMN IF NOT EXISTS new_column VARCHAR(100);
   CREATE INDEX IF NOT EXISTS idx_users_new_column ON users(new_column);
   COMMIT;
   ```

3. Run the migration:
   ```bash
   npm run migrate
   ```

## Integrity

The runner detects if a previously-applied migration file has been modified (hash mismatch).
This helps prevent accidental edits to historical migrations and detects potential tampering.

## Removing Old Scripts

The old runner scripts (`run_migration.js`, `run_fixed_transportation_migration.js`, etc.)
are kept for backward compatibility but should no longer be used. All migrations should
be run through the unified runner.
