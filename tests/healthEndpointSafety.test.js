const test = require('node:test');
const assert = require('node:assert/strict');

const { buildHealthCheckPayload } = require('../config/utils/healthCheck');

test('health summary hides database and redis details from anonymous callers', () => {
  const payload = buildHealthCheckPayload({
    status: 'OK',
    database: 'OK',
    redis: 'OK',
    uptimeSeconds: 42,
  });

  assert.equal(payload.status, 'OK');
  assert.ok(payload.timestamp);
  assert.equal(payload.service, 'rentalhub-ng');
  assert.equal('database' in payload, false);
  assert.equal('redis' in payload, false);
  assert.equal('uptime' in payload, false);
});

