const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const source = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'stateMigrationService.js'),
  'utf8'
);

test('migration decisions notify the migrating user', () => {
  assert.ok(
    source.includes('notifyMigrationDecision'),
    'a migration decision notifier must exist'
  );
  assert.ok(
    source.includes("'state_migration_approved'") || source.includes('state_migration_${'),
    'an approved notification type must be used'
  );
});

test('the notification is sent after COMMIT, not inside the transaction', () => {
  // Every notifyMigrationDecision call must appear after a COMMIT.
  const lines = source.split('\n');
  const callLines = lines
    .map((line, index) => (line.includes('await notifyMigrationDecision(') ? index : -1))
    .filter((index) => index >= 0);

  assert.equal(callLines.length, 2, 'both review paths must notify');

  for (const callLine of callLines) {
    const before = lines.slice(0, callLine).reverse();
    const lastCommit = before.findIndex((line) => line.includes("await client.query('COMMIT')"));
    assert.ok(lastCommit >= 0, 'a COMMIT must precede the notification');
    // No BEGIN between that COMMIT and the call, or we are back in a txn.
    const between = before.slice(0, lastCommit);
    const strayBegin = between.findIndex((line) => line.includes("await client.query('BEGIN')"));
    assert.ok(strayBegin === -1, 'the notification must not run inside an open transaction');
  }
});

test('a rejected request says so, an approved one confirms the new state', () => {
  assert.ok(source.includes('State migration approved'), 'approved wording present');
  assert.ok(source.includes('State migration not approved'), 'rejected wording present');
  assert.ok(source.includes('Your assigned state is now'), 'approved message names the new state');
});

test('the notifier can never break the review response', () => {
  // The helper must swallow its own errors.
  assert.ok(
    source.includes("logger.error('Migration decision notification error:'"),
    'notification failures must be caught and logged, not thrown'
  );
});
