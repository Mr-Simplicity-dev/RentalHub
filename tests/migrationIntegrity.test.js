const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  computeCanonicalMigrationHash,
  extractMigrationNumber,
  findDuplicateMigrationNumbers,
  findMissingAppliedMigrationFiles,
  findRenamedAppliedMigrations,
  isStoredMigrationHashCompatible,
  normalizeMigrationContent,
  stripOuterMigrationTransaction,
} = require('../scripts/migrationIntegrity');

const hash = (content) =>
  crypto.createHash('sha256').update(content, 'utf8').digest('hex');

test('migration checksums are stable across LF, CRLF and UTF-8 BOM files', () => {
  const lf = 'ALTER TABLE users\n  ADD COLUMN example TEXT;\n';
  const crlf = lf.replace(/\n/g, '\r\n');

  assert.equal(computeCanonicalMigrationHash(lf), computeCanonicalMigrationHash(crlf));
  assert.equal(normalizeMigrationContent(`\uFEFF${crlf}`), lf);
  assert.equal(isStoredMigrationHashCompatible(hash(crlf), lf), true);
  assert.equal(isStoredMigrationHashCompatible(hash(`\uFEFF${crlf}`), lf), true);
});

test('migration checksum compatibility still rejects real SQL changes', () => {
  const original = 'ALTER TABLE users ADD COLUMN example TEXT;\n';
  const changed = 'ALTER TABLE users ADD COLUMN example INTEGER;\n';

  assert.equal(isStoredMigrationHashCompatible(hash(original), changed), false);
});

test('duplicate migration numbers are detected before execution', () => {
  const duplicates = findDuplicateMigrationNumbers([
    { number: '106', filename: '106_first.sql' },
    { number: '106', filename: '106_second.sql' },
    { number: '107', filename: '107_third.sql' },
  ]);

  assert.deepEqual(duplicates, [{
    number: '106',
    filenames: ['106_first.sql', '106_second.sql'],
  }]);

  assert.deepEqual(findDuplicateMigrationNumbers([
    { number: '031', filename: '031_base.sql' },
    { number: '031a', filename: '031a_forward_repair.sql' },
  ]), []);
});

test('an applied migration missing from a release is detected', () => {
  assert.deepEqual(
    findMissingAppliedMigrationFiles(
      [{ filename: '001_base.sql' }, { filename: '002_applied.sql' }],
      [{ filename: '001_base.sql' }]
    ),
    ['002_applied.sql']
  );
});

test('an applied migration renamed in a later release is matched by content', () => {
  const content = 'ALTER TABLE appeals ADD COLUMN active_uniqueness TEXT;\n';
  const applied = [
    { filename: '001_base.sql', hash: hash('-- base\n') },
    { filename: '106_admin_appeal_active_uniqueness.sql', hash: hash(content) },
  ];
  const migrations = [
    { filename: '001_base.sql', content: '-- base\n' },
    { filename: '110_admin_appeal_active_uniqueness.sql', content },
  ];

  assert.deepEqual(
    findRenamedAppliedMigrations(applied, migrations),
    [{ from: '106_admin_appeal_active_uniqueness.sql', to: '110_admin_appeal_active_uniqueness.sql' }]
  );
});

test('renamed migration detection still rejects changed or unrelated content', () => {
  const applied = [
    { filename: '002_edited.sql', hash: hash('ALTER TABLE t ADD COLUMN a TEXT;\n') },
    { filename: '003_deleted.sql', hash: hash('-- gone\n') },
  ];
  const migrations = [
    { filename: '002_edited.sql', content: 'ALTER TABLE t ADD COLUMN a INTEGER;\n' },
  ];

  assert.deepEqual(findRenamedAppliedMigrations(applied, migrations), []);
});

test('legacy outer transactions are stripped without touching procedural BEGIN blocks', () => {
  const migration = `-- comment
BEGIN;

DO $$
BEGIN
  RAISE NOTICE 'inside procedure';
END
$$;

COMMIT;
`;
  const result = stripOuterMigrationTransaction(migration);

  assert.equal(result.stripped, true);
  assert.doesNotMatch(result.content, /^\s*BEGIN\s*;/im);
  assert.doesNotMatch(result.content, /^\s*COMMIT\s*;/im);
  assert.match(result.content, /\nBEGIN\n/);
  assert.throws(
    () => stripOuterMigrationTransaction('BEGIN;\nSELECT 1;'),
    /incomplete outer/i
  );
});

test('repository migrations have unique identifiers and supported transactions', () => {
  const migrationsDirectory = path.join(__dirname, '..', 'migrations');
  const filenames = fs.readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  const migrations = filenames.map((filename) => ({
    filename,
    number: extractMigrationNumber(filename),
    content: fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8'),
  }));

  assert.deepEqual(findDuplicateMigrationNumbers(migrations), []);
  migrations.forEach(({ filename, content }) => {
    assert.doesNotThrow(
      () => stripOuterMigrationTransaction(content),
      `${filename} must have a supported transaction wrapper`
    );
  });

  assert.ok(filenames.indexOf('031_lga_admin_system.sql') < filenames.indexOf('031a_transportation_core.sql'));
  assert.ok(filenames.indexOf('031a_transportation_core.sql') < filenames.indexOf('032_transportation_admin_monitoring.sql'));
});
