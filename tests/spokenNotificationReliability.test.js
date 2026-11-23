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
    if (/UPDATE spoken_notification_events/i.test(sql) && /acknowledged_at\s*=\s*CURRENT_TIMESTAMP/i.test(sql)) {
      return { rows: [{ id: 1, status: 'acknowledged', acknowledged_at: new Date().toISOString(), acknowledged_by_device: 'dev1', attempt_count: 1, last_failure_reason: null, next_eligible_at: null }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 1, deviceId: 'dev1', outcome: 'success' , claimToken: 'test-claim-token' });
    assert.equal(res.acknowledged, true);
    assert.equal(res.event.status, 'acknowledged');
  });
  assert.ok(calls.some((c) => /acknowledged_at\s*=\s*CURRENT_TIMESTAMP/i.test(c.sql)));
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
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 2, deviceId: 'dev1', outcome: 'failed', reason: 'speech_error' , claimToken: 'test-claim-token' });
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
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 3, deviceId: 'dev1', outcome: 'interrupted', reason: 'speech_interrupted' , claimToken: 'test-claim-token' });
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
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 4, deviceId: 'dev1', outcome: 'unavailable', reason: 'speech_synthesis_unavailable' , claimToken: 'test-claim-token' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.permanent, true);
    assert.equal(res.event.status, 'failed');
  });
  assert.equal(params[4], true); // permanent flag
});

test('claimEvent uses atomic single UPDATE with claim guards and claim token', async () => {
  let claimSql = '';
  let claimParams;
  await withMockDb(async (sql, params) => {
    if (/UPDATE spoken_notification_events/i.test(sql) && /SET status = 'claimed'/i.test(sql)) {
      claimSql = sql;
      claimParams = params;
      return { rows: [{ id: 5, status: 'claimed', claimed_by_device: 'devA', claim_token: 'tokA' }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 9, eventId: 5, deviceId: 'devA', claimToken: 'tokA' });
    assert.equal(res.status, 'claimed');
  });
  assert.match(claimSql, /acknowledged_at IS NULL/);
  assert.match(claimSql, /expires_at\s*>\s*CURRENT_TIMESTAMP/);
  assert.match(claimSql, /attempt_count < COALESCE\(max_attempts, \$4\)/);
  assert.match(claimSql, /claim_token\s*=\s*\$5/);
  assert.match(claimSql, /claim_token IS NOT NULL AND claim_token = \$5 AND claim_expires_at > CURRENT_TIMESTAMP/);
  assert.equal(claimParams[0], 5);
  assert.equal(claimParams[1], 9);
  assert.equal(claimParams[2], 'devA');
  assert.equal(claimParams[4], 'tokA');
});

test('simultaneous claims: different device IDs - only first wins', async () => {
  let call = 0;
  await withMockDb(async (sql) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      call += 1;
      return call === 1 ? { rows: [{ id: 6, status: 'claimed', claimed_by_device: 'devA' }] } : { rows: [] };
    }
    return { rows: [] };
  }, async () => {
    const [a, b] = await Promise.all([
      service.claimEvent({ userId: 1, eventId: 6, deviceId: 'devA', claimToken: 'tokA' }),
      service.claimEvent({ userId: 1, eventId: 6, deviceId: 'devB', claimToken: 'tokB' }),
    ]);
    assert.ok(a);
    assert.equal(b, null);
  });
});

test('simultaneous claims: same device ID different tokens - second concurrent request gets no claim', async () => {
  let call = 0;
  const seenTokens = [];
  await withMockDb(async (sql, params) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      call += 1;
      seenTokens.push(params[4]);
      // DB row lock/WHERE re-evaluation would allow first, reject second different token on active lease
      return call === 1 ? { rows: [{ id: 7, status: 'claimed', claimed_by_device: 'devA', claim_token: params[4] }] } : { rows: [] };
    }
    return { rows: [] };
  }, async () => {
    const [a, b] = await Promise.all([
      service.claimEvent({ userId: 1, eventId: 7, deviceId: 'devA', claimToken: 'tok1' }),
      service.claimEvent({ userId: 1, eventId: 7, deviceId: 'devA', claimToken: 'tok2' }),
    ]);
    assert.ok(a);
    assert.equal(b, null);
    assert.deepEqual(seenTokens, ['tok1', 'tok2']);
  });
});

test('legitimate retry after expired claim can reclaim', async () => {
  let claimSql = '';
  await withMockDb(async (sql) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      claimSql = sql;
      return { rows: [{ id: 8, status: 'claimed', claimed_by_device: 'devB', claim_token: 'tokNew' }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 1, eventId: 8, deviceId: 'devB', claimToken: 'tokNew' });
    assert.ok(res);
    assert.equal(res.status, 'claimed');
  });
  assert.match(claimSql, /claim_expires_at IS NULL OR claim_expires_at\s*<=\s*CURRENT_TIMESTAMP/);
});

test('second claim while valid lease is active is rejected for different attempt', async () => {
  await withMockDb(async (sql) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      return { rows: [] }; // active lease, different token/device does not match
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 1, eventId: 9, deviceId: 'devB', claimToken: 'tokDifferent' });
    assert.equal(res, null);
  });
});

test('acknowledged event cannot be claimed again', async () => {
  let claimSql = '';
  await withMockDb(async (sql) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      claimSql = sql;
      return { rows: [] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 1, eventId: 10, deviceId: 'devA', claimToken: 'tokA' });
    assert.equal(res, null);
  });
  assert.match(claimSql, /acknowledged_at IS NULL/);
});

test('expired event cannot be claimed', async () => {
  let claimSql = '';
  await withMockDb(async (sql) => {
    if (/SET status = 'claimed'/i.test(sql)) {
      claimSql = sql;
      return { rows: [] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.claimEvent({ userId: 1, eventId: 11, deviceId: 'devA', claimToken: 'tokA' });
    assert.equal(res, null);
  });
  assert.match(claimSql, /expires_at\s*>\s*CURRENT_TIMESTAMP/);
});

test('bounded retry: exhausted attempts mark failed and no next retry', async () => {
  await withMockDb(async (sql) => {
    if (/last_failure_reason/i.test(sql)) {
      return { rows: [{ id: 12, status: 'failed', acknowledged_at: null, attempt_count: 3, max_attempts: 3, last_failure_reason: 'speech_error', next_eligible_at: null }] };
    }
    return { rows: [] };
  }, async () => {
    const res = await service.recordPlaybackResult({ userId: 7, eventId: 12, deviceId: 'dev1', outcome: 'failed', reason: 'speech_error' , claimToken: 'test-claim-token' });
    assert.equal(res.acknowledged, false);
    assert.equal(res.event.status, 'failed');
    assert.equal(res.event.next_eligible_at, null);
  });
});
