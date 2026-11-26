const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMultilingualFeatureFlags,
  getPublicMultilingualConfig,
} = require('../config/utils/multilingualConfig');
const { translatePlainText } = require('../services/azureTranslatorService');
const translationService = require('../services/translationService');
const { translationLimiter: productionTranslationLimiter } = require('../config/middleware/securityRateLimiters');
const { createTranslationLimiter, RedisTranslationStore, INCREMENT_SCRIPT } = require('../config/middleware/translationRateLimiter');

const envWith = (overrides = {}) => ({
  PROPERTY_DESCRIPTION_TRANSLATION_ENABLED: 'true',
  MESSAGE_TRANSLATION_ENABLED: 'true',
  AZURE_TRANSLATOR_ENABLED: 'true',
  AZURE_TRANSLATOR_KEY: 'test-key',
  AZURE_TRANSLATOR_REGION: 'test-region',
  AZURE_TRANSLATOR_ENDPOINT: 'https://translator.example.test',
  AZURE_TRANSLATOR_MAX_RETRIES: '1',
  AZURE_TRANSLATOR_TIMEOUT_MS: '20',
  ...overrides,
});

const successfulFetch = (requests) => async (url, options) => {
  requests.push({ url, options });
  return {
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify([{ translations: [{ text: 'Bonjour traduit' }] }]),
    json: async () => [{ translations: [{ text: 'Bonjour traduit' }] }],
  };
};

const approvedProperty = {
  id: 12,
  description: 'A bright apartment near the park.',
  landlord_id: 99,
  is_available: true,
  is_verified: true,
  status: 'available',
  deleted_at: null,
  ownership_verification_status: 'verified',
  created_at: '2025-01-01T00:00:00.000Z',
};

const landlordTenantMessage = {
  id: 44,
  sender_id: 1,
  receiver_id: 2,
  sender_role: 'landlord',
  receiver_role: 'tenant',
  message_type: 'general',
  message_text: 'The rent is paid.',
  is_read: true,
};

const assertReadOnly = (statements) => {
  assert.ok(statements.length > 0);
  assert.ok(statements.every((sql) => /^\s*SELECT/i.test(sql)), 'all SQL must be SELECT');
  assert.ok(
    statements.every((sql) => !/\b(CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|TRUNCATE|MERGE)\b/i.test(sql)),
    'no schema or data mutation statements'
  );
};

const queryFor = ({
  property = approvedProperty,
  gate = { enabled: false, ownership_gate_enabled_at: null },
  agentRows = [],
  publicRows = [approvedProperty],
  unlockRows = [],
  message = landlordTenantMessage,
} = {}) => {
  const statements = [];
  const query = async (sql) => {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    if (sql.includes('FROM properties WHERE id')) return { rows: property ? [property] : [] };
    if (sql.includes('FROM feature_flags')) return { rows: gate ? [gate] : [] };
    if (sql.includes('FROM landlord_agents')) return { rows: agentRows };
    if (sql.includes('FROM tenant_property_unlocks')) return { rows: unlockRows };
    if (sql.includes('SELECT id') && sql.includes('FROM properties')) return { rows: publicRows };
    if (sql.includes('FROM messages m')) return { rows: message ? [message] : [] };
    return { rows: [] };
  };
  return { query, statements };
};

const expectNoProviderCall = async (operation) => {
  let fetchCalled = false;
  await assert.rejects(operation(() => { fetchCalled = true; }));
  assert.equal(fetchCalled, false);
};

test('Phase D flags are disabled by default', () => {
  const flags = getMultilingualFeatureFlags({});
  assert.equal(flags.propertyDescriptionTranslationEnabled, false);
  assert.equal(flags.messageTranslationEnabled, false);
});

test('Phase D fails closed without Azure configuration', async () => {
  const env = envWith({ AZURE_TRANSLATOR_KEY: '', AZURE_TRANSLATOR_REGION: '' });
  await assert.rejects(
    translationService.translatePropertyDescriptionForUser({
      user: { id: 5 },
      propertyId: 12,
      targetLanguage: 'fr',
      deps: { env, dbQuery: queryFor().query },
    }),
    (error) => error.code === 'TRANSLATION_UNAVAILABLE'
  );
});

test('public config exposes only the two frontend flags and no provider metadata', () => {
  const config = getPublicMultilingualConfig(envWith());
  assert.deepEqual(Object.keys(config), ['features']);
  assert.deepEqual(Object.keys(config.features).sort(), [
    'messageTranslationEnabled',
    'propertyDescriptionTranslationEnabled',
  ]);
  assert.equal(config.features.propertyDescriptionTranslationEnabled, true);
  assert.equal(config.features.messageTranslationEnabled, true);
  const serialized = JSON.stringify(config);
  for (const leaked of ['test-key', 'translator.example.test', 'test-region', '3.0', 'azureTranslator', 'azureSpeech']) {
    assert.equal(serialized.includes(leaked), false);
  }
});

test('unsupported target languages are rejected before any provider call', async () => {
  const { query, statements } = queryFor();
  await expectNoProviderCall((fetchImpl) => translationService.translatePropertyDescriptionForUser({
    user: { id: 5 },
    propertyId: 12,
    targetLanguage: 'klingon',
    deps: { env: envWith(), dbQuery: query, fetchImpl },
  }));
  assert.equal(statements.length, 0);
});

const unlockedTenantRows = [{ id: 1, unlocked_at: '2026-01-02T00:00:00.000Z' }];
const propertyActors = [
  ['owner', { id: 99 }, [], []],
  ['manager', { id: 55 }, [{ id: 1 }], []],
  ['unlocked tenant', { id: 5 }, [], unlockedTenantRows],
];
const lockedPropertyActors = [
  ['unauthenticated viewer', null, [], []],
  ['public viewer without unlock', { id: 5 }, [], []],
];

for (const [label, user, agentRows, unlockRows] of propertyActors) {
  test(`${label} can translate an approved available listing`, async () => {
    const requests = [];
    const { query, statements } = queryFor({ agentRows, unlockRows });
    const result = await translationService.translatePropertyDescriptionForUser({
      user,
      propertyId: 12,
      targetLanguage: 'fr',
      deps: { env: envWith(), dbQuery: query, fetchImpl: successfulFetch(requests) },
    });
    assert.equal(result.original_text, approvedProperty.description);
    assert.equal(result.domain, 'property_description');
    assert.equal(requests.length, 1);
    assertReadOnly(statements);
  });
}

for (const [label, user, agentRows, unlockRows] of lockedPropertyActors) {
  test(`${label} cannot translate a locked description`, async () => {
    const { query, statements } = queryFor({ agentRows, unlockRows });
    let fetchCalled = false;
    await assert.rejects(
      translationService.translatePropertyDescriptionForUser({
        user,
        propertyId: 12,
        targetLanguage: 'fr',
        deps: {
          env: envWith(),
          dbQuery: query,
          fetchImpl: () => { fetchCalled = true; },
        },
      }),
      (error) => error.code === 'PROPERTY_TRANSLATION_FORBIDDEN'
        && !error.message.includes(approvedProperty.description)
    );
    assert.equal(fetchCalled, false);
    assertReadOnly(statements);
  });
}

test('direct API calls cannot bypass the unlock entitlement with client-supplied access flags', async () => {
  const { query, statements } = queryFor({ unlockRows: [] });
  let fetchCalled = false;
  await assert.rejects(
    translationService.translatePropertyDescriptionForUser({
      user: { id: 5 },
      propertyId: 12,
      targetLanguage: 'fr',
      hasFullAccess: true,
      description: approvedProperty.description,
      deps: {
        env: envWith(),
        dbQuery: query,
        fetchImpl: () => { fetchCalled = true; },
      },
    }),
    (error) => error.code === 'PROPERTY_TRANSLATION_FORBIDDEN'
      && !error.message.includes(approvedProperty.description)
  );
  assert.equal(fetchCalled, false);
  assertReadOnly(statements);
});

test('a revoked or failed unlock lookup fails closed without leaking the description', async () => {
  const { statements } = queryFor();
  const query = async (sql) => {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    if (sql.includes('FROM tenant_property_unlocks')) throw new Error('entitlement lookup failed');
    if (sql.includes('FROM properties WHERE id')) return { rows: [approvedProperty] };
    if (sql.includes('FROM feature_flags')) return { rows: [{ enabled: false }] };
    return { rows: [] };
  };
  let fetchCalled = false;
  await assert.rejects(
    translationService.translatePropertyDescriptionForUser({
      user: { id: 5 },
      propertyId: 12,
      targetLanguage: 'fr',
      deps: {
        env: envWith(),
        dbQuery: query,
        fetchImpl: () => { fetchCalled = true; },
      },
    }),
    (error) => error.code === 'PROPERTY_TRANSLATION_FORBIDDEN'
      && !error.message.includes(approvedProperty.description)
  );
  assert.equal(fetchCalled, false);
});

const restrictedVariants = [
  ['unavailable', { is_available: false }],
  ['unverified', { is_verified: false }],
  ['pending', { status: 'pending' }],
  ['unpublished', { status: 'draft' }],
  ['deleted', { deleted_at: '2026-01-01T00:00:00.000Z' }],
];

for (const [state, changes] of restrictedVariants) {
  for (const [label, user, agentRows, unlockRows] of propertyActors) {
    test(`${label} cannot translate a ${state} listing`, async () => {
      const property = { ...approvedProperty, ...changes };
      const { query, statements } = queryFor({
        property,
        agentRows,
        publicRows: [property],
        unlockRows,
      });
      await expectNoProviderCall((fetchImpl) => translationService.translatePropertyDescriptionForUser({
        user,
        propertyId: 12,
        targetLanguage: 'fr',
        deps: { env: envWith(), dbQuery: query, fetchImpl },
      }));
      assertReadOnly(statements);
    });
  }
}

for (const [label, user, agentRows, unlockRows] of propertyActors) {
  test(`${label} respects the ownership gate`, async () => {
    const gate = { enabled: true, ownership_gate_enabled_at: '2026-01-01T00:00:00.000Z' };
    const unverifiedOld = { ...approvedProperty, ownership_verification_status: 'unverified', created_at: '2025-01-01T00:00:00.000Z' };
    const unverifiedNew = { ...approvedProperty, ownership_verification_status: 'unverified', created_at: '2026-06-01T00:00:00.000Z' };

    const oldRequests = [];
    await translationService.translatePropertyDescriptionForUser({
      user,
      propertyId: 12,
      targetLanguage: 'fr',
      deps: {
        env: envWith(),
        dbQuery: queryFor({ property: unverifiedOld, gate, agentRows, publicRows: [unverifiedOld], unlockRows }).query,
        fetchImpl: successfulFetch(oldRequests),
      },
    });
    assert.equal(oldRequests.length, 1);

    await expectNoProviderCall((fetchImpl) => translationService.translatePropertyDescriptionForUser({
      user,
      propertyId: 12,
      targetLanguage: 'fr',
      deps: {
        env: envWith(),
        dbQuery: queryFor({ property: unverifiedNew, gate, agentRows, publicRows: [unverifiedNew], unlockRows }).query,
        fetchImpl,
      },
    }));
  });
}

test('property status lookup failure fails closed before Azure', async () => {
  const query = async (sql) => {
    if (sql.includes('FROM feature_flags')) throw new Error('test lookup failure');
    if (sql.includes('FROM properties WHERE id')) return { rows: [approvedProperty] };
    return { rows: [] };
  };
  await expectNoProviderCall((fetchImpl) => translationService.translatePropertyDescriptionForUser({
    user: { id: 99 },
    propertyId: 12,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl },
  }));
});

test('property translation uses the authoritative description, not client content', async () => {
  const requests = [];
  const { query, statements } = queryFor();
  const result = await translationService.translatePropertyDescriptionForUser({
    user: { id: 99 },
    propertyId: 12,
    targetLanguage: 'fr',
    description: 'client replacement',
    deps: { env: envWith(), dbQuery: query, fetchImpl: successfulFetch(requests) },
  });
  assert.equal(result.original_text, approvedProperty.description);
  assert.deepEqual(JSON.parse(requests[0].options.body), [{ text: approvedProperty.description }]);
  assertReadOnly(statements);
});

test('URL-like property descriptions are rejected before Azure', async () => {
  const property = { ...approvedProperty, description: 'https://cdn.example.test/download?id=123' };
  const { query } = queryFor({ property, publicRows: [property] });
  let fetchCalled = false;
  await assert.rejects(
    translationService.translatePropertyDescriptionForUser({
      user: { id: 99 },
      propertyId: 12,
      targetLanguage: 'fr',
      deps: { env: envWith(), dbQuery: query, fetchImpl: () => { fetchCalled = true; } },
    }),
    (error) => error.code === 'TRANSLATION_INVALID_TEXT'
  );
  assert.equal(fetchCalled, false);
});

test('message translation rejects non-participants before provider call', async () => {
  const { query } = queryFor();
  await expectNoProviderCall((fetchImpl) => translationService.translateMessageForUser({
    user: { id: 7 },
    messageId: 44,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl },
  }));
});

test('message translation rejects conversations that are not landlord-tenant', async () => {
  const message = { ...landlordTenantMessage, sender_role: 'tenant', receiver_role: 'tenant' };
  const { query } = queryFor({ message });
  await expectNoProviderCall((fetchImpl) => translationService.translateMessageForUser({
    user: { id: 1 },
    messageId: 44,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl },
  }));
});

test('attachment metadata blocks translation and never reaches Azure', async () => {
  const message = {
    ...landlordTenantMessage,
    attachment_url: 'https://cdn.example.test/doc.pdf',
    attachment_type: 'application/pdf',
  };
  const { query } = queryFor({ message });
  await expectNoProviderCall((fetchImpl) => translationService.translateMessageForUser({
    user: { id: 1 },
    messageId: 44,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl },
  }));
});

const rejectedMessages = [
  'https://cdn.example.test/download?id=123',
  'https://cdn.example.test/download?X-Amz-Signature=abcd&X-Amz-Expires=60',
  'https://cdn.example.test/voice/RE123?token=opaque',
  'www.example.test/download?id=123',
  '//cdn.example.test/download?id=123',
  'data:audio/mp4;base64,AAAA',
  'data:application/pdf;base64,AAAA',
  'https://cdn.example.test/lease.pdf',
  'https://cdn.example.test/photo.jpg?size=large',
];

for (const messageText of rejectedMessages) {
  test(`URL-like message text is rejected before Azure: ${messageText}`, async () => {
    const message = { ...landlordTenantMessage, message_text: messageText };
    const { query } = queryFor({ message });
    let fetchCalled = false;
    await assert.rejects(
      translationService.translateMessageForUser({
        user: { id: 1 },
        messageId: 44,
        targetLanguage: 'fr',
        deps: { env: envWith(), dbQuery: query, fetchImpl: () => { fetchCalled = true; } },
      }),
      (error) => error.code === 'TRANSLATION_INVALID_TEXT'
    );
    assert.equal(fetchCalled, false);
  });
}

test('ordinary text without URLs is still translated', async () => {
  const requests = [];
  const message = { ...landlordTenantMessage, message_text: 'Please pay the rent before Friday.' };
  const { query, statements } = queryFor({ message });
  const result = await translationService.translateMessageForUser({
    user: { id: 2 },
    messageId: 44,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl: successfulFetch(requests) },
  });
  assert.equal(result.original_text, message.message_text);
  assert.equal(result.machine_translated, true);
  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].options.body), [{ text: message.message_text }]);
  assertReadOnly(statements);
});

test('message translation preserves the original message and has no write side effects', async () => {
  const requests = [];
  const { query, statements } = queryFor();
  const result = await translationService.translateMessageForUser({
    user: { id: 2 },
    messageId: 44,
    targetLanguage: 'fr',
    deps: { env: envWith(), dbQuery: query, fetchImpl: successfulFetch(requests) },
  });
  assert.equal(result.original_text, landlordTenantMessage.message_text);
  assert.equal(JSON.stringify(requests[0].options.body).includes('attachment'), false);
  assertReadOnly(statements);
});

const okResponse = (value, headers = {}) => ({
  ok: true,
  headers: { get: (name) => headers[name] ?? null },
  text: async () => JSON.stringify(value),
  json: async () => value,
});

const runAzure = async (responses) => {
  const calls = [];
  const result = await translatePlainText({
    text: 'Hello',
    targetLanguage: 'fr',
    env: envWith(),
    fetchImpl: async (_url, options) => {
      calls.push(options.body);
      const response = responses.shift();
      return typeof response === 'function' ? response() : response;
    },
    sleep: async () => {},
  });
  return { calls, result };
};

test('Azure accepts a bounded successful response', async () => {
  const { calls, result } = await runAzure([okResponse([{ translations: [{ text: 'Bonjour' }] }])]);
  assert.equal(result.translatedText, 'Bonjour');
  assert.equal(calls.length, 1);
});

test('Azure rejects oversized responses before parsing', async () => {
  let jsonCalled = false;
  const response = okResponse([{ translations: [{ text: 'Bonjour' }] }], { 'content-length': '999999' });
  response.json = async () => { jsonCalled = true; return [{ translations: [{ text: 'Bonjour' }] }]; };
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: async () => { calls += 1; return response; },
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_RESPONSE_TOO_LARGE'
  );
  assert.equal(jsonCalled, false);
  assert.equal(calls, 1);
});

test('Azure rejects malformed JSON safely', async () => {
  const response = {
    ok: true,
    headers: { get: () => null },
    text: async () => '{bad json',
    json: async () => { throw new Error('bad json'); },
  };
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: async () => { calls += 1; return response; },
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_PROVIDER_ERROR' && error.message === 'Translation failed. Please try again.'
  );
  assert.equal(calls, 1);
});

for (const [label, value] of [
  ['empty results', []],
  ['missing translations', [{ translations: [] }]],
  ['missing text', [{ translations: [{ text: '' }] }]],
  ['oversized translation', [{ translations: [{ text: 'x'.repeat(5001) }] }]],
]) {
  test(`Azure rejects ${label} safely`, async () => {
    let calls = 0;
    await assert.rejects(
      translatePlainText({
        text: 'Hello',
        targetLanguage: 'fr',
        env: envWith(),
        fetchImpl: async () => { calls += 1; return okResponse(value); },
        sleep: async () => {},
      }),
      (error) => error.code === 'TRANSLATION_PROVIDER_ERROR'
    );
    assert.equal(calls, 1);
  });
}

test('Azure 429 is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: async () => { calls += 1; return { ok: false, status: 429 }; },
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_RATE_LIMITED' && error.statusCode === 429
  );
  assert.equal(calls, 1);
});

test('Azure retries bounded server errors and succeeds', async () => {
  const { calls, result } = await runAzure([
    { ok: false, status: 500 },
    okResponse([{ translations: [{ text: 'Bonjour' }] }]),
  ]);
  assert.equal(result.translatedText, 'Bonjour');
  assert.equal(calls.length, 2);
});

test('Azure timeout fails after bounded retries', async () => {
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
        calls += 1;
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_TIMEOUT'
  );
  assert.equal(calls, 2);
});

test('Azure timeout covers a pending response body and cleans up the timer', async () => {
  let timerFn = null;
  let timerSequence = 900;
  const cleared = [];
  let abortObserved = false;
  let capturedSignal = null;
  const response = {
    ok: true,
    headers: { get: () => null },
    text: () => new Promise(() => {}),
  };
  const pending = translatePlainText({
    text: 'Hello',
    targetLanguage: 'fr',
    env: envWith({ AZURE_TRANSLATOR_MAX_RETRIES: '1', AZURE_TRANSLATOR_TIMEOUT_MS: '20' }),
    fetchImpl: async (_url, options) => {
      capturedSignal = options.signal;
      options.signal.addEventListener('abort', () => { abortObserved = true; });
      return response;
    },
    sleep: async () => {},
    setTimeout: (fn) => { timerFn = fn; return timerSequence += 1; },
    clearTimeout: (id) => { cleared.push(id); },
  });

  const rejection = assert.rejects(pending, (error) => error.code === 'TRANSLATION_TIMEOUT');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    const fireTimer = timerFn;
    timerFn = null;
    assert.equal(typeof fireTimer, 'function');
    fireTimer();
  }
  await rejection;
  assert.equal(abortObserved, true);
  assert.ok(capturedSignal);
  assert.equal(cleared.length, 2);
});

test('Azure network errors are bounded and do not leak provider details', async () => {
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: async () => {
        calls += 1;
        throw new Error('ECONNRESET internal-provider-detail');
      },
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_PROVIDER_ERROR'
      && error.message === 'Translation failed. Please try again.'
      && !error.message.includes('internal-provider-detail')
  );
  assert.equal(calls, 2);
});

test('Azure client errors are not retried and do not leak provider details', async () => {
  let calls = 0;
  await assert.rejects(
    translatePlainText({
      text: 'Hello',
      targetLanguage: 'fr',
      env: envWith(),
      fetchImpl: async () => { calls += 1; return { ok: false, status: 400 }; },
      sleep: async () => {},
    }),
    (error) => error.code === 'TRANSLATION_PROVIDER_ERROR' && error.message === 'Translation failed. Please try again.'
  );
  assert.equal(calls, 1);
});

const createMockSharedStore = ({ fail = false } = {}) => {
  const counters = new Map();
  return {
    increments: 0,
    async increment(key, windowMs) {
      this.increments += 1;
      if (fail) throw Object.assign(new Error('shared store unavailable'), { code: 'ECONNREFUSED' });
      const now = Date.now();
      const current = counters.get(key);
      if (!current || current.resetTime <= now) {
        counters.set(key, { count: 1, resetTime: now + windowMs });
      } else {
        current.count += 1;
      }
      const next = counters.get(key);
      return { totalHits: next.count, resetTime: new Date(next.resetTime) };
    },
    async decrement(key) { counters.delete(key); },
    async resetKey(key) { counters.delete(key); },
  };
};

const silentLogger = { error() {}, warn() {}, info() {} };

const createTestLimiter = ({ store = createMockSharedStore(), max = 60, logger = silentLogger } = {}) => createTranslationLimiter({
  env: {},
  sharedStore: store,
  max,
  windowMs: 15 * 60 * 1000,
  logger,
});

const invokeLimiter = (limiter, req) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; finish(); return this; },
    send(payload) { this.body = payload; finish(); return this; },
    end() { finish(); },
  };
  const finish = () => resolve(res);
  limiter(req, res, finish);
});

test('two workers share one authenticated-user quota through the injected shared store', async () => {
  const store = createMockSharedStore();
  const workerA = createTestLimiter({ store });
  const workerB = createTestLimiter({ store });
  for (let i = 0; i < 60; i += 1) {
    const res = await invokeLimiter(i % 2 === 0 ? workerA : workerB, {
      user: { id: 8901 },
      ip: `203.0.113.${i % 20 + 1}`,
    });
    assert.equal(res.statusCode, 200);
  }
  const blocked = await invokeLimiter(workerB, { user: { id: 8901 }, ip: '198.51.100.99' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(store.increments, 61);
});

test('concurrent requests cannot exceed the shared quota', async () => {
  const limiter = createTestLimiter({ max: 5 });
  const results = await Promise.all(Array.from({ length: 20 }, () => invokeLimiter(limiter, {
    user: { id: 8902 },
    ip: '203.0.114.1',
  })));
  assert.equal(results.filter((res) => res.statusCode === 200).length, 5);
  assert.equal(results.filter((res) => res.statusCode === 429).length, 15);
});

test('shared store failure does not create a fresh process-local allowance', async () => {
  const store = createMockSharedStore();
  const first = createTestLimiter({ store, max: 2 });
  assert.equal((await invokeLimiter(first, { user: { id: 8903 }, ip: '192.0.2.1' })).statusCode, 200);

  const failed = await invokeLimiter(createTestLimiter({
    store: createMockSharedStore({ fail: true }),
    max: 2,
  }), { user: { id: 8903 }, ip: '192.0.2.2' });
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.code, 'TRANSLATION_LIMITER_UNAVAILABLE');

  const replacement = createTestLimiter({ store, max: 2 });
  assert.equal((await invokeLimiter(replacement, { user: { id: 8903 }, ip: '192.0.2.3' })).statusCode, 200);
  assert.equal((await invokeLimiter(replacement, { user: { id: 8903 }, ip: '192.0.2.4' })).statusCode, 429);
});

test('spoofed forwarded headers do not create a new authenticated-user quota', async () => {
  const limiter = createTestLimiter({ max: 2 });
  assert.equal((await invokeLimiter(limiter, {
    user: { id: 8904 },
    ip: '203.0.115.1',
    headers: { 'x-forwarded-for': '198.51.100.200' },
  })).statusCode, 200);
  assert.equal((await invokeLimiter(limiter, {
    user: { id: 8904 },
    ip: '203.0.115.2',
    headers: { 'x-forwarded-for': '198.51.100.201' },
  })).statusCode, 200);
  assert.equal((await invokeLimiter(limiter, {
    user: { id: 8904 },
    ip: '203.0.115.3',
    headers: { 'x-forwarded-for': '198.51.100.202' },
  })).statusCode, 429);
});

test('different authenticated users have separate quotas', async () => {
  const limiter = createTestLimiter({ max: 1 });
  assert.equal((await invokeLimiter(limiter, { user: { id: 8905 }, ip: '192.0.2.20' })).statusCode, 200);
  assert.equal((await invokeLimiter(limiter, { user: { id: 8905 }, ip: '192.0.2.21' })).statusCode, 429);
  assert.equal((await invokeLimiter(limiter, { user: { id: 8906 }, ip: '192.0.2.20' })).statusCode, 200);
});

test('unauthenticated translation requests are rejected by route authentication before the limiter', () => {
  const fs = require('fs');
  const path = require('path');
  for (const [file, marker] of [
    ['routes/messages.js', '/:messageId/translate'],
    ['routes/properties.js', '/:propertyId/translate-description'],
  ]) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const start = source.indexOf(marker);
    assert.ok(start >= 0, `${marker} must exist`);
    const route = source.slice(start, start + 400);
    assert.ok(route.indexOf('authenticate') >= 0 && route.indexOf('authenticate') < route.indexOf('translationLimiter'));
  }
});

test('translation is blocked safely when no shared limiter is available', () => {
  const errors = [];
  const limiter = createTranslationLimiter({
    env: {},
    logger: { error: (message, meta) => errors.push({ message, meta }) },
  });
  return invokeLimiter(limiter, { user: { id: 8907 }, ip: '192.0.2.30' }).then((res) => {
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'TRANSLATION_LIMITER_UNAVAILABLE');
    assert.ok(!JSON.stringify(res.body).includes('REDIS'));
    assert.equal(errors.length, 1);
    assert.equal(errors[0].meta.code, 'SHARED_STORE_UNAVAILABLE');
    assert.ok(typeof productionTranslationLimiter === 'function');
  });
});

test('translation limiter still separates unauthenticated addresses', async () => {
  const limiter = createTestLimiter({ max: 1 });
  assert.equal((await invokeLimiter(limiter, { ip: '192.0.2.10' })).statusCode, 200);
  assert.equal((await invokeLimiter(limiter, { ip: '192.0.2.10' })).statusCode, 429);
  assert.equal((await invokeLimiter(limiter, { ip: '192.0.2.11' })).statusCode, 200);
});

test('an invalid dedicated Redis URL fails closed without creating a client or exposing details', async () => {
  let factoryCalls = 0;
  const limiter = createTranslationLimiter({
    env: { TRANSLATION_RATE_LIMIT_REDIS_URL: 'not-a-redis-url-secret' },
    logger: silentLogger,
    redisFactory: () => { factoryCalls += 1; throw new Error('should not be called'); },
  });
  const res = await invokeLimiter(limiter, { user: { id: 8908 }, ip: '192.0.2.40' });
  assert.equal(factoryCalls, 0);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'TRANSLATION_LIMITER_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('not-a-redis-url-secret'), false);
});

test('invalid window and quota values fail closed instead of disabling expiry', async () => {
  for (const options of [{ windowMs: -1 }, { max: 0 }, { max: 1.5 }]) {
    const limiter = createTranslationLimiter({ env: {}, logger: silentLogger, ...options });
    const res = await invokeLimiter(limiter, { user: { id: 8909 }, ip: '192.0.2.41' });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'TRANSLATION_LIMITER_UNAVAILABLE');
  }
});

test('the shared store uses one atomic Redis script with a rolling TTL', async () => {
  assert.match(INCREMENT_SCRIPT, /redis\.call\('INCR', key\)/);
  assert.match(INCREMENT_SCRIPT, /redis\.call\('PEXPIRE', key, window_ms\)/);
  assert.match(INCREMENT_SCRIPT, /redis\.call\('PTTL', key\)/);
  let captured;
  const store = new RedisTranslationStore({
    client: {
      async eval(script, keyCount, key, window) {
        captured = { script, keyCount, key, window };
        return [3, 1234];
      },
    },
    now: () => 1000,
  });
  const result = await store.increment('user:8910');
  assert.equal(captured.script, INCREMENT_SCRIPT);
  assert.equal(captured.keyCount, 1);
  assert.match(captured.key, /^translation:rl:[a-f0-9]{64}$/);
  assert.equal(captured.window, String(15 * 60 * 1000));
  assert.equal(result.totalHits, 3);
  assert.equal(result.resetTime.getTime(), 2234);
});

test('the production translation limiter exposes a close hook for graceful shutdown', () => {
  assert.equal(typeof productionTranslationLimiter.close, 'function');
});
