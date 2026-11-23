const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../config/middleware/database');
const service = require('../config/utils/spokenNotificationService');

const withMockDb = async (mockQuery, fn) => {
  const orig = db.query;
  db.query = mockQuery;
  try {
    return await fn();
  } finally {
    db.query = orig;
  }
};

test('successful playback records acknowledged result only on success', async () => {
  const calls = [];
  await withMockDb(async (sql, params) => {
    calls.push({ sql, params });
    if (/UPDATE spoken_notification_events/i.test(sql) && /acknowledged_at = CURRENT_TIMESTAMP/i.test(sql)) {
      return { rows: [{ id: 1, status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by_device: 'dev1', attempt_count: 1, last_failure_reason: null, next_eligible_at: null }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 1, deviceId: 'dev1', outcome: 'success' });
    assert.equal(res.acknowledged, true);
    assert.equal(res.event.status, 'acknowledged');
  });
  assert.ok(calls.some((c) => /acknowledged_at = CURRENT_TIMESTAMP/i.test(c.sql)));
});

test('failed playback is recorded separately and not acknowledged', async () => {
  let updateSql = '';
  await withMockDb(async (sql) => {
    if (/UPDATE spoken_notification_events/i.test(sql) && /last_failure_reason/i.test(sql)) {
      updateSql = sql;
      return { rows: [{ id: 2, status: 'pending', acknowledged_at: null, attempt_count: 1, max_attempts: 3, last_failure_reason: 'speech_error', next_eligible_at: new Date(Date.now() + 60000).toISOString() }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 2, deviceId: 'dev1', outcome: 'failed', reason: 'speech_error' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.event.status, 'pending');
    assert.equal(res.event.last_failure_reason, 'speech_error');
  });
  assert.match(updateSql, /acknowledged_at IS NULL/);
  assert.match(updateSql, /next_eligible_at/);
});

test('interrupted playback is recorded as recoverable failure', async () => {
  await withMockDb(async (sql) => {
    if (/last_failure_reason/i.test(sql)) {
      return { rows: [{ id: 3, status: 'pending', acknowledged_at: null, attempt_count: 1, last_failure_reason: 'speech_interrupted', next_eligible_at: new Date().toISOString() }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 3, deviceId: 'dev1', outcome: 'interrupted', reason: 'speech_interrupted' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.event.status, 'pending');
  });
});

test('unavailable audio is marked permanently failed and not retried endlessly', async () => {
  let params;
  await withMockDb(async (sql, p) => {
    if (/last_failure_reason/i.test(sql)) {
      params = p;
      return { rows: [{ id: 4, status: 'failed', acknowledged_at: null, attempt_count: 1, last_failure_reason: 'speech_synthesis_unavailable', next_eligible_at: null }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 4, deviceId: 'dev1', outcome: 'unavailable', reason: 'speech_synthesis_unavailable' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.permanent, true);
    assert.equal(res.event.status, 'failed');
  });
  assert.equal(params[3], true); // permanent flag
});

test('claimEvent uses atomic single UPDATE with claim guards', async () => {
  let claimSql = '';
  let claimParams;
  await withMockDb(async (sql, params) => {
    if (/UPDATE spoken_notification_events/i.test(sql) && /claim_expires_at = CURRENT_TIMESTAMP \+ INTERVAL '90 seconds'/i.test(sql)) {
      claimSql = sql;
      claimParams = params;
      return { rows: [{ id: 5, status: 'claimed', claimed_by_device: 'devA' }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 9, eventId: 5, deviceId: 'devA' });
    assert.equal(res.status, 'claimed');
  });
  assert.match(claimSql, /attempt_count = attempt_count \+ 1/);
  assert.match(claimSql, /acknowledged_at IS NULL/);
  assert.match(claimSql, /expires_at > CURRENT_TIMESTAMP/);
  assert.match(claimSql, /attempt_count < COALESCE\(max_attempts, \$4\)/);
  assert.equal(claimParams[0], 5);
  assert.equal(claimParams[1], 9);
  assert.equal(claimParams[2], 'devA');
});

test('simultaneous claim attempts: second claimant gets no row when first claim wins', async () => {
  let call = 0;
  await withMockDb(async (sql) => {
    if (/claim_expires_at = CURRENT_TIMESTAMP \+ INTERVAL '90 seconds'/i.test(sql)) {
      call += 1;
      if (call === 1) return { rows: [{ id: 6, status: 'claimed', claimed_by_device: 'devA' }] };
      return { rows: [] }; // atomic row condition no longer matches
    }
    return { rows: [] };
  }, async () => {
    const [a, b] = await Promise.all([
      service.claimEvent({ userId: 1, eventId: 6, deviceId: 'devA' }),
      service.claimEvent({ userId: 1, eventId: 6, deviceId: 'devB' }),
    ]);
    assert.ok(a);
    assert.equal(b, null);
  });
});

test('bounded retry: exhausted attempts mark failed and no next retry', async () => {
  await withMockDb(async (sql) => {
    if (/last_failure_reason/i.test(sql)) {
      return { rows: [{ id: 7, status: 'failed', acknowledged_at: null, attempt_count: 3, max_attempts: 3, last_failure_reason: 'speech_error', next_eligible_at: null }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 7, deviceId: 'dev1', outcome: 'failed', reason: 'speech_error' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.event.status, 'failed');
    assert.equal(res.event.next_eligible_at, null);
  });
});
