const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');

// The Redis-backed stores fall back to in-memory counters when no Redis URL is
// configured, which keeps this test hermetic.
process.env.REDIS_URL = '';
process.env.UPSTASH_REDIS_URL = '';

const {
  sensitiveActionLimiter,
  authSensitiveLimiter,
} = require('../config/middleware/securityRateLimiters');

// Regression: every limiter hashed to the same Redis key (sha256 of the client
// IP only), so all limiters shared ONE counter. Twelve ordinary "sensitive"
// requests in the window then blocked unrelated routes for that client — real
// users saw "Too many sensitive requests" after only a handful of taps.
test('each limiter counts on its own bucket', async (t) => {
  const app = express();
  app.post('/sensitive', sensitiveActionLimiter, (req, res) => res.json({ ok: true }));
  app.post('/auth-sensitive', authSensitiveLimiter, (req, res) => res.json({ ok: true }));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const post = (path) =>
    new Promise((resolve, reject) => {
      const req = http.request({ port, path, method: 'POST' }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });

  const first = await post('/sensitive');
  assert.equal(first.status, 200);

  const limit = Number.parseInt(
    first.headers['ratelimit-limit'] || first.headers['ratelimit-policy'] || '',
    10
  );
  assert.ok(Number.isFinite(limit) && limit > 0, 'limiter publishes its maximum');

  for (let sent = 1; sent < limit; sent += 1) {
    const result = await post('/sensitive');
    assert.equal(result.status, 200, `request ${sent + 1} of ${limit} should pass`);
  }

  const blocked = await post('/sensitive');
  assert.equal(blocked.status, 429, 'the next request past the maximum is blocked');

  const other = await post('/auth-sensitive');
  assert.equal(other.status, 200, 'a different limiter keeps its own counter');
  assert.match(other.body, /"ok":true/);
});
