const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const db = require('../config/middleware/database');
const spoken = require('../config/utils/spokenNotificationService');

const withMockDb = async (mockQuery, fn) => {
  const orig = db.query;
  db.query = mockQuery;
  try { return await fn(); } finally { db.query = orig; }
};

test('Phase C regression: rent-savings reminder uses correct createNotification positional args and dedup key', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'jobs', 'rentSavingsJobs.js'), 'utf8');
  assert.match(src, /createNotification\(plan\.tenant_id,\s*'rent_savings_due_reminder',\s*title,\s*message,\s*`\/dashboard\/rent-savings\/\$\{plan\.id\}`,\s*dedupKey\)/);
  assert.match(src, /dedupKey = `rent-savings-due:\$\{plan\.id\}:\$\{todayKey\}`/);
});

test('Phase C regression: rent payment spoken announcement is emitted only for completed rent_payment', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'services', 'paymentService.js'), 'utf8');
  assert.match(src, /row\.payment_type !== 'rent_payment'/);
  assert.match(src, /event === 'completed' && row\.payment_status !== 'completed'/);
  assert.match(src, /RENT_PAYMENT_SUCCESS/);
  assert.match(src, /dedupKey: `rent-payment-success:\$\{paymentId\}`/);
});

test('Phase C regression: playback ack requires claimed device and claim token', async () => {
  const calls = [];
  await withMockDb(async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  }, async () => {
    const res = await spoken.recordPlaybackResult({ userId: 1, eventId: 2, deviceId: 'dev1', claimToken: 'tok1', outcome: 'success' });
    assert.equal(res.acknowledged, false);
  });
  const successSql = calls.find((c) => /status='acknowledged'/i.test(c.sql))?.sql || '';
  assert.match(successSql, /claimed_by_device=\$3/);
  assert.match(successSql, /claim_token=\$4/);
  assert.match(successSql, /claim_expires_at>CURRENT_TIMESTAMP/);
});

test('Phase C regression: playback ack rejects missing claim token/device', async () => {
  await withMockDb(async () => ({ rows: [{ id: 1 }] }), async () => {
    const res = await spoken.recordPlaybackResult({ userId: 1, eventId: 2, deviceId: '', claimToken: '', outcome: 'success' });
    assert.equal(res.event, null);
    assert.equal(res.acknowledged, false);
  });
});

test('Phase C regression: spoken emit uses user language copy, not hard-coded English', async () => {
  let inserted;
  await withMockDb(async (sql, params) => {
    if (/SELECT preferences FROM user_notification_preferences/i.test(sql)) {
      return { rows: [{ preferences: { spokenNotificationsEnabled: true, spokenNotificationLanguage: 'ha' } }] };
    }
    if (/SELECT claim_token, attempt_count/i.test(sql)) return { rows: [] };
    if (/INSERT INTO spoken_notification_events/i.test(sql)) {
      inserted = params;
      return { rows: [{ id: 99 }] };
    }
    return { rows: [] };
  }, async () => {
    const row = await spoken.emitSpokenEvent({
      userId: 7,
      eventType: spoken.EVENT_TYPES.RENT_SAVINGS_DUE_REMINDER,
      sourceType: 'rent_savings_plan',
      sourceId: 1,
      dedupKey: 'rent-savings-due:1:2026-11-25',
      title: 'English title should be ignored',
      message: 'English message should be ignored',
      payload: { kind: 'rent_savings' },
      expiresAt: new Date(Date.now() + 600000),
    });
    assert.equal(row.id, 99);
  });
  // params: userId,eventType,sourceType,sourceId,dedupKey,title,message,language,audioKey,payload,expiresAt,maxAttempts
  assert.equal(inserted[7], 'ha');
  assert.notEqual(inserted[5], 'English title should be ignored');
  assert.notEqual(inserted[6], 'English message should be ignored');
});

test('corrective migration 2058 adds claim_token safely', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'migrations', '2058_spoken_claim_ownership.sql'), 'utf8');
  assert.match(src, /ADD COLUMN IF NOT EXISTS claim_token VARCHAR\(120\)/i);
  assert.match(src, /UPDATE spoken_notification_events/i);
});