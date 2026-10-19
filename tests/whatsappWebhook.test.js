const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('http');
const crypto = require('crypto');

const whatsappWebhookRoutes = require('../routes/whatsappWebhook');
const inputSanitizer = require('../config/middleware/inputSanitizer');

const VERIFY_TOKEN = 'test-verify-token-9f2b';
const APP_SECRET = 'test-app-secret-77aa';

const originalEnv = {
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const startServer = async () => {
  const app = express();
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    })
  );
  app.use('/api/whatsapp/webhook', whatsappWebhookRoutes);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return server;
};

const request = (port, { path, method = 'GET', headers = {}, body }) =>
  new Promise((resolve, reject) => {
    const req = http.request({ port, path, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });

test('Meta verification handshake', async (t) => {
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  const server = await startServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(restoreEnv);
  const port = server.address().port;

  const ok = await request(port, {
    path: `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=8421836`,
  });
  assert.equal(ok.status, 200, 'correct token echoes the challenge');
  assert.equal(ok.body, '8421836');

  const badToken = await request(port, {
    path: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1',
  });
  assert.equal(badToken.status, 403, 'wrong verify token is rejected');

  const badMode = await request(port, {
    path: `/api/whatsapp/webhook?hub.mode=unsubscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=1`,
  });
  assert.equal(badMode.status, 403, 'only subscribe is accepted');

  const noChallenge = await request(port, {
    path: `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}`,
  });
  assert.equal(noChallenge.status, 403, 'missing challenge is rejected');
});

test('verification fails closed when no token is configured', async (t) => {
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  const server = await startServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(restoreEnv);
  const port = server.address().port;

  const res = await request(port, {
    path: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=&hub.challenge=1',
  });
  assert.equal(res.status, 403, 'empty configured token never verifies');
});

test('handshake works with the global input sanitizer in the chain', async (t) => {
  // Production mounts this route BEFORE inputSanitizer: the sanitizer deletes
  // every query key containing a dot, which would wipe Meta's hub.* params.
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;

  const app = express();
  app.use('/api/whatsapp/webhook', whatsappWebhookRoutes);
  app.use(inputSanitizer);
  app.get('/sanitized', (req, res) => res.json(req.query));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(restoreEnv);
  const port = server.address().port;

  const ok = await request(port, {
    path: `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=8421836`,
  });
  assert.equal(ok.status, 200, 'handshake succeeds when the route precedes the sanitizer');
  assert.equal(ok.body, '8421836');

  const stripped = await request(port, {
    path: '/sanitized?hub.mode=subscribe&hub.verify_token=abc&hub.challenge=1',
  });
  assert.deepEqual(
    JSON.parse(stripped.body),
    {},
    'documents why: the sanitizer drops dotted query keys entirely'
  );
});

test('event deliveries are acknowledged and optionally signature-checked', async (t) => {
  process.env.WHATSAPP_VERIFY_TOKEN = VERIFY_TOKEN;
  delete process.env.WHATSAPP_APP_SECRET;
  const server = await startServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(restoreEnv);
  const port = server.address().port;

  const payload = JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [{ id: 'wamid.1', status: 'delivered' }],
              messages: [],
            },
          },
        ],
      },
    ],
  });
  const jsonHeaders = { 'Content-Type': 'application/json' };

  const open = await request(port, {
    path: '/api/whatsapp/webhook',
    method: 'POST',
    headers: jsonHeaders,
    body: payload,
  });
  assert.equal(open.status, 200, 'acknowledged without an app secret configured');
  assert.match(open.body, /"success":true/);

  const empty = await request(port, {
    path: '/api/whatsapp/webhook',
    method: 'POST',
    headers: jsonHeaders,
    body: '{}',
  });
  assert.equal(empty.status, 200, 'empty payloads never fail the subscription');

  process.env.WHATSAPP_APP_SECRET = APP_SECRET;

  const signature = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex');
  const signed = await request(port, {
    path: '/api/whatsapp/webhook',
    method: 'POST',
    headers: { ...jsonHeaders, 'x-hub-signature-256': `sha256=${signature}` },
    body: payload,
  });
  assert.equal(signed.status, 200, 'valid X-Hub-Signature-256 is accepted');

  const forged = await request(port, {
    path: '/api/whatsapp/webhook',
    method: 'POST',
    headers: { ...jsonHeaders, 'x-hub-signature-256': `sha256=${'0'.repeat(64)}` },
    body: payload,
  });
  assert.equal(forged.status, 401, 'forged signature is rejected');

  const missing = await request(port, {
    path: '/api/whatsapp/webhook',
    method: 'POST',
    headers: jsonHeaders,
    body: payload,
  });
  assert.equal(missing.status, 401, 'missing signature is rejected once a secret exists');
});
