const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const csrfProtection = require('../../config/middleware/csrfProtection');

const invokeApp = async (app, method, urlPath, headers = {}, body = undefined) => {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    return { status: res.status, data };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

test('csrfProtection blocks spoofed X-RentalHub-Client when ambient auth cookie is present without Bearer token', async () => {
  const app = express();
  app.use(express.json());
  app.use(csrfProtection);
  app.post('/api/properties', (_req, res) => res.json({ success: true }));

  const blocked = await invokeApp(
    app,
    'POST',
    '/api/properties',
    {
      'X-RentalHub-Client': 'native',
      Cookie: 'auth_token=fake_cookie_jwt',
    },
    { title: 'Test' }
  );
  assert.equal(blocked.status, 403);

  const bearerAllowed = await invokeApp(
    app,
    'POST',
    '/api/properties',
    {
      'X-RentalHub-Client': 'native',
      Cookie: 'auth_token=fake_cookie_jwt',
      Authorization: 'Bearer valid_bearer_token',
    },
    { title: 'Test' }
  );
  assert.equal(bearerAllowed.status, 200);

  const cookieFreeNativeAllowed = await invokeApp(
    app,
    'POST',
    '/api/properties',
    {
      'X-RentalHub-Client': 'native',
    },
    { title: 'Test' }
  );
  assert.equal(cookieFreeNativeAllowed.status, 200);
});

test('mobileDiagnostics respects the published iOS override, evaluates updateRequired, and rejects oversized metadata', async t => {
  const previous = {version:process.env.MOBILE_IOS_LATEST_VERSION,build:process.env.MOBILE_IOS_BUILD_NUMBER};
  process.env.MOBILE_IOS_LATEST_VERSION='1.0.52';process.env.MOBILE_IOS_BUILD_NUMBER='63';
  t.after(()=>{for(const [key,value] of [['MOBILE_IOS_LATEST_VERSION',previous.version],['MOBILE_IOS_BUILD_NUMBER',previous.build]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const diagPath = path.resolve(__dirname, '../../routes/mobileDiagnostics.js');
  const dbPath = path.resolve(__dirname, '../../config/middleware/database.js');
  const inserts = [];

  delete require.cache[diagPath];
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolved === dbPath) {
      return {
        query: async (sql, params = []) => {
          inserts.push({ sql, params });
          return { rows: [{ id: 1, created_at: new Date().toISOString() }] };
        },
      };
    }
    return origLoad.call(this, request, parent, isMain);
  };

  let router;
  try {
    router = require(diagPath);
  } finally {
    Module._load = origLoad;
    delete require.cache[diagPath];
  }

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.headers['x-test-user-id']) {
      req.user = { id: Number(req.headers['x-test-user-id']) };
    }
    next();
  });
  app.use('/api/mobile', router);

  const upToDateIos = await invokeApp(
    app,
    'GET',
    '/api/mobile/app-version?platform=ios&version=1.0.52&buildNumber=63'
  );
  assert.equal(upToDateIos.status, 200);
  assert.equal(upToDateIos.data.data.latest_version, '1.0.52');
  assert.equal(upToDateIos.data.data.update_available, false);
  assert.equal(upToDateIos.data.data.update_required, false);

  const oldIos = await invokeApp(
    app,
    'GET',
    '/api/mobile/app-version?platform=ios&version=0.9.0&buildNumber=1'
  );
  assert.equal(oldIos.status, 200);
  assert.equal(oldIos.data.data.update_available, true);
  assert.equal(oldIos.data.data.update_required, true);

  const bigMeta = await invokeApp(
    app,
    'POST',
    '/api/mobile/diagnostics/crash',
    { 'x-test-user-id': '77' },
    { message: 'Crash', metadata: { blob: 'x'.repeat(5000) } }
  );
  assert.equal(bigMeta.status, 400);

  const okCrash = await invokeApp(
    app,
    'POST',
    '/api/mobile/diagnostics/crash',
    { 'x-test-user-id': '77' },
    { message: 'Crash handled', metadata: { source: 'test' } }
  );
  assert.equal(okCrash.status, 201);
  const insertCall = inserts.find((entry) => entry.sql.includes('INSERT INTO mobile_crash_reports'));
  assert.ok(insertCall);
  assert.equal(insertCall.params[6], 77);
});
