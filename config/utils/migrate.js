// Backward-compatible entry point. All migration execution is intentionally
// centralized in scripts/runMigrations.js so tracking, checksums, locking and
// transactions cannot diverge between runners.
require('../../scripts/runMigrations');
