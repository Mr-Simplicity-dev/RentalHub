const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { EventEmitter } = require('events');
const { requireTurnstile } = require('../config/middleware/turnstileVerify');

const ENV_KEYS = ['NODE_ENV', 'TURNSTILE_SECRET_KEY', 'TURNSTILE_SKIP_VERIFICATION'];

const withEnv = async (values, fn) => {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]]);
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const withHttpsRequest = async (implementation, fn) => {
  const original = https.request;
  https.request = implementation;
  try {
    await fn();
  } finally {
    https.request = original;
  }
};

const providerResponse = (payload) => {
  const response = new EventEmitter();
  process.nextTick(() => {
    response.emit('data', JSON.stringify(payload));
    response.emit('end');
  });
  return response;
};

const mockRequest = (payload) => (_options, callback) => {
  const request = new EventEmitter();
  request.setTimeout = () => request;
  request.write = () => {};
  request.end = () => callback(providerResponse(payload));
  return request;
};

const makeRes = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const runMiddleware = async (values, req, requestImpl = null) => {
  let calledNext = false;
  const res = makeRes();
  await withEnv(values, async () => {
    const middleware = requireTurnstile('rentalhub_login');
    if (requestImpl) {
      await withHttpsRequest(requestImpl, async () => {
        await middleware(req, res, () => { calledNext = true; });
      });
    } else {
      await middleware(req, res, () => { calledNext = true; });
    }
  });
  return { res, calledNext };
};

test('missing Turnstile secret rejects the protected request', async () => {
  const { res, calledNext } = await runMiddleware(
    { NODE_ENV: 'production', TURNSTILE_SKIP_VERIFICATION: 'false' },
    { body: { turnstile_token: 'synthetic-token' }, ip: '127.0.0.1' }
  );
  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('missing or invalid token rejects even when the secret is configured', async () => {
  const values = {
    NODE_ENV: 'production',
    TURNSTILE_SECRET_KEY: 'synthetic-secret',
    TURNSTILE_SKIP_VERIFICATION: 'false',
  };
  for (const token of [undefined, '', '   ']) {
    const { res, calledNext } = await runMiddleware(values, { body: { turnstile_token: token } });
    assert.equal(calledNext, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }
});

test('provider verification failure rejects the protected request', async () => {
  const { res, calledNext } = await runMiddleware(
    {
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 'synthetic-secret',
      TURNSTILE_SKIP_VERIFICATION: 'false',
    },
    { body: { turnstile_token: 'synthetic-token' }, ip: '127.0.0.1' },
    mockRequest({ success: false, action: 'rentalhub_login' })
  );
  assert.equal(calledNext, false);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
});

test('valid Turnstile verification succeeds', async () => {
  const { res, calledNext } = await runMiddleware(
    {
      NODE_ENV: 'production',
      TURNSTILE_SECRET_KEY: 'synthetic-secret',
      TURNSTILE_SKIP_VERIFICATION: 'false',
    },
    { body: { turnstile_token: 'synthetic-token' }, ip: '127.0.0.1' },
    mockRequest({ success: true, action: 'rentalhub_login' })
  );
  assert.equal(calledNext, true);
  assert.equal(res.statusCode, null);
});

test('test-only skip flag cannot activate in production', async () => {
  const production = await runMiddleware(
    { NODE_ENV: 'production', TURNSTILE_SKIP_VERIFICATION: 'true' },
    { body: { turnstile_token: 'synthetic-token' } }
  );
  assert.equal(production.calledNext, false);
  assert.equal(production.res.statusCode, 400);

  const testRun = await runMiddleware(
    { NODE_ENV: 'test', TURNSTILE_SKIP_VERIFICATION: 'true' },
    { body: {} }
  );
  assert.equal(testRun.calledNext, true);
  assert.equal(testRun.res.statusCode, null);
});
