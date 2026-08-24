const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const db = require('../config/middleware/database');
const usersRouter = require('../routes/users');

const {
  TOUR_EVENTS,
  buildTourAnalyticsWhere,
  calculateTourRate,
  deriveTourStateTransition,
  normalizeTourLocale,
  normalizeTourObject,
  recordTourEvent,
  resetSchemaCheck,
  serializeTourState,
} = usersRouter._tourForTest;

const tourSchemaRows = {
  user_tour_states: [
    'user_id',
    'platform',
    'tour_key',
    'last_skipped_at',
    'current_step',
    'current_step_id',
    'total_steps',
    'progress_updated_at',
    'locale',
    'context',
    'last_event_type',
    'last_event_at',
    'resume_count',
    'last_resumed_at',
    'active_session_id',
    'last_sequence_number',
    'state_revision',
  ],
  user_tour_events: [
    'user_id',
    'platform',
    'tour_key',
    'event_id',
    'locale',
    'route',
    'target_id',
    'reason_code',
    'session_id',
    'sequence_number',
    'duration_ms',
    'client_created_at',
    'context',
  ],
};

const informationSchemaRows = Object.entries(tourSchemaRows).flatMap(
  ([table_name, columns]) => columns.map((column_name) => ({ table_name, column_name }))
);

const getRouteHandler = (routePath, method) => {
  const layer = usersRouter.stack.find(
    (candidate) => candidate.route?.path === routePath && candidate.route.methods?.[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${routePath} must be registered`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
};

const createJsonResponse = () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return response;
};

const withMockedTourDatabase = async (clientQuery, callback) => {
  const originalQuery = db.query;
  const originalConnect = db.connect;
  const calls = [];
  const client = {
    query: async (sql, params = []) => {
      const call = { sql: String(sql), params };
      calls.push(call);
      return clientQuery(call, calls);
    },
    release: () => {},
  };

  resetSchemaCheck();
  db.query = async (sql) => {
    assert.match(String(sql), /information_schema\.columns/);
    return { rows: informationSchemaRows };
  };
  db.connect = async () => client;

  try {
    return await callback(calls);
  } finally {
    db.query = originalQuery;
    db.connect = originalConnect;
    resetSchemaCheck();
  }
};

test('tour migration adds resumable state and actionable analytics events', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '112_tour_resume_analytics.sql'),
    'utf8'
  );

  for (const column of [
    'current_step',
    'current_step_id',
    'total_steps',
    'progress_updated_at',
    'locale',
    'context',
    'state_revision',
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  for (const eventType of [
    'resumed',
    'step_viewed',
    'step_completed',
    'action_completed',
    'target_missing',
    'step_unavailable',
  ]) {
    assert.equal(TOUR_EVENTS.has(eventType), true);
    assert.match(migration, new RegExp(`'${eventType}'`));
  }
  assert.match(migration, /idx_user_tour_events_session_sequence/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS context JSONB/);
});

test('tour state serialization provides a stable resume contract', () => {
  assert.deepEqual(
    serializeTourState({
      status: 'in_progress',
      current_step: '3',
      current_step_id: 'open-messages',
      total_steps: '7',
      state_revision: '9',
      context: null,
    }),
    {
      status: 'in_progress',
      current_step: 3,
      current_step_id: 'open-messages',
      last_step_id: 'open-messages',
      total_steps: 7,
      state_revision: 9,
      context: {},
      can_resume: true,
    }
  );
});

test('tour locale, context size, analytics filters and rates are validated', () => {
  assert.equal(normalizeTourLocale('en_NG'), 'en-NG');
  assert.throws(() => normalizeTourLocale('not a locale'), /valid language tag/i);
  assert.throws(
    () => normalizeTourObject({ value: 'x'.repeat(9000) }, 'Tour context', 8192),
    /8 KB or smaller/i
  );

  const where = buildTourAnalyticsWhere({
    days: 30,
    platform: 'web',
    tourKey: 'tenant_dashboard',
    dashboardType: null,
    locale: 'fr',
  });
  assert.match(where.sql, /events\.created_at/);
  assert.match(where.sql, /events\.platform = \$2/);
  assert.match(where.sql, /events\.tour_key = \$3/);
  assert.match(where.sql, /events\.locale = \$4/);
  assert.deepEqual(where.values, [30, 'web', 'tenant_dashboard', 'fr']);
  assert.equal(calculateTourRate(3, 4), 75);
  assert.equal(calculateTourRate(1, 0), 0);
  assert.equal(calculateTourRate(2, 1), 100);
});

test('tour cursor transitions reject stale sequences and inactive sessions', () => {
  const state = {
    tour_version: '3',
    status: 'in_progress',
    current_step: 3,
    current_step_id: 'payments',
    total_steps: 7,
    context: { route: '/payments' },
    active_session_id: 'active-session',
    last_sequence_number: 9,
    last_event_at: '2026-08-01T10:00:00.000Z',
  };
  const baseEvent = {
    eventType: 'step_viewed',
    dashboardType: 'tenant_dashboard',
    tourVersion: '3',
    stepId: 'messages',
    currentStep: 4,
    totalSteps: 7,
    locale: 'en',
    context: { route: '/messages' },
    contextProvided: true,
    clientCreatedAt: '2026-08-01T10:01:00.000Z',
  };

  assert.deepEqual(
    deriveTourStateTransition(state, {
      ...baseEvent,
      sessionId: 'active-session',
      sequenceNumber: 9,
    }),
    { applied: false, reason: 'stale_sequence' }
  );
  assert.deepEqual(
    deriveTourStateTransition(state, {
      ...baseEvent,
      sessionId: 'retired-session',
      sequenceNumber: 10,
    }),
    { applied: false, reason: 'inactive_session' }
  );
});

test('terminal tours only reopen on replay or a newer tour version', () => {
  const state = {
    tour_version: '3',
    status: 'completed',
    current_step: 6,
    current_step_id: 'done',
    total_steps: 7,
    context: { route: '/old' },
    active_session_id: 'old-session',
    last_sequence_number: 12,
    last_event_at: '2026-08-01T10:00:00.000Z',
  };
  const baseEvent = {
    dashboardType: 'tenant_dashboard',
    stepId: null,
    currentStep: 0,
    totalSteps: 8,
    locale: 'fr',
    context: { route: '/dashboard' },
    contextProvided: true,
    sessionId: 'new-session',
    sequenceNumber: 1,
    clientCreatedAt: '2026-08-01T10:05:00.000Z',
  };

  assert.deepEqual(
    deriveTourStateTransition(state, {
      ...baseEvent,
      eventType: 'started',
      tourVersion: '3',
    }),
    { applied: false, reason: 'terminal_tour_state' }
  );

  const replay = deriveTourStateTransition(state, {
    ...baseEvent,
    eventType: 'replayed',
    tourVersion: '3',
  });
  assert.equal(replay.applied, true);
  assert.equal(replay.values.status, 'in_progress');
  assert.equal(replay.values.currentStep, 0);
  assert.deepEqual(replay.values.context, { route: '/dashboard' });

  const upgraded = deriveTourStateTransition(state, {
    ...baseEvent,
    eventType: 'started',
    tourVersion: '4',
  });
  assert.equal(upgraded.applied, true);
  assert.equal(upgraded.values.tourVersion, '4');
  assert.equal(upgraded.values.currentStep, 0);
});

test('analytics endpoint is admin-only and returns a complete empty dashboard shape', async () => {
  const handler = getRouteHandler('/tour/analytics', 'get');
  const forbiddenResponse = createJsonResponse();
  await handler(
    {
      user: { id: 7, user_type: 'tenant' },
      query: {},
      logger: { error: () => {} },
    },
    forbiddenResponse
  );
  assert.equal(forbiddenResponse.statusCode, 403);

  const originalQuery = db.query;
  let analyticsQueries = 0;
  resetSchemaCheck();
  db.query = async (sql) => {
    if (String(sql).includes('information_schema.columns')) {
      return { rows: informationSchemaRows };
    }
    analyticsQueries += 1;
    return { rows: [] };
  };

  try {
    const response = createJsonResponse();
    await handler(
      {
        user: { id: 1, user_type: 'super_admin' },
        query: { days: '30', platform: 'web', locale: 'fr' },
        logger: { error: () => {} },
      },
      response
    );

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.days, 30);
    assert.deepEqual(response.body.data.filters, {
      platform: 'web',
      tour_key: null,
      dashboard_type: null,
      locale: 'fr',
    });
    assert.equal(response.body.data.overview.completion_rate, 0);
    for (const collection of [
      'summary',
      'daily',
      'by_platform',
      'by_tour',
      'steps',
      'locales',
      'statuses',
      'problems',
      'issues',
    ]) {
      assert.deepEqual(response.body.data[collection], []);
    }
    assert.equal(analyticsQueries, 11);
  } finally {
    db.query = originalQuery;
    resetSchemaCheck();
  }
});

test('step_viewed persists a localized resume cursor and normalized context', async () => {
  let eventInsert;
  let stateInsert;
  const persistedState = {
    user_id: 42,
    platform: 'mobile',
    tour_key: 'tenant_dashboard',
    status: 'in_progress',
    current_step: 2,
    current_step_id: 'open-messages',
    total_steps: 6,
    locale: 'en-NG',
    context: { route: 'TenantHome', empty_state: false },
    state_revision: '1',
  };

  await withMockedTourDatabase(async ({ sql, params }) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}] };
    if (sql.includes('INSERT INTO user_tour_events')) {
      eventInsert = { sql, params };
      return { rows: [{ id: 10, event_id: 'event-1' }], rowCount: 1 };
    }
    if (sql.includes('FROM user_tour_states') && sql.includes('FOR UPDATE')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO user_tour_states')) {
      stateInsert = { sql, params };
      return { rows: [persistedState], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    const result = await recordTourEvent(42, {
      event_id: 'event-1',
      platform: 'mobile',
      tour_key: 'tenant_dashboard',
      event_type: 'step_viewed',
      dashboard_type: 'tenant_dashboard',
      tour_version: '3',
      step_id: 'open-messages',
      current_step: 2,
      total_steps: 6,
      locale: 'en_NG',
      route: 'TenantHome',
      session_id: 'session-1',
      sequence_number: 4,
      context: { empty_state: false },
    });

    assert.equal(result.deduplicated, false);
    assert.equal(result.state.can_resume, true);
    assert.equal(result.state.last_step_id, 'open-messages');
  });

  assert.equal(eventInsert.params[11], 'en-NG');
  assert.equal(eventInsert.params[12], 'TenantHome');
  assert.equal(eventInsert.params[15], 'session-1');
  assert.equal(eventInsert.params[16], 4);
  assert.equal(stateInsert.params[6], 2);
  assert.equal(stateInsert.params[7], 'open-messages');
  assert.equal(stateInsert.params[8], 6);
  assert.deepEqual(JSON.parse(stateInsert.params[11]), {
    empty_state: false,
    route: 'TenantHome',
  });
});

test('retries return existing state without incrementing it twice', async () => {
  let stateWrites = 0;
  const existingState = {
    user_id: 42,
    platform: 'web',
    tour_key: 'tenant_dashboard',
    tour_version: '3',
    status: 'in_progress',
    current_step: 1,
    current_step_id: 'search',
    total_steps: 5,
    context: {},
    state_revision: 2,
  };

  await withMockedTourDatabase(async ({ sql }) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}] };
    if (sql.includes('INSERT INTO user_tour_events')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM user_tour_events')) {
      return {
        rows: [{
          tour_key: 'tenant_dashboard',
          event_type: 'step_viewed',
          tour_version: '3',
          step_id: 'search',
          current_step: 1,
          total_steps: 5,
        }],
      };
    }
    if (sql.includes('FROM user_tour_states')) return { rows: [existingState] };
    if (/\b(?:INSERT INTO|UPDATE) user_tour_states/.test(sql)) stateWrites += 1;
    return { rows: [] };
  }, async () => {
    const result = await recordTourEvent(42, {
      event_id: 'retry-1',
      platform: 'web',
      tour_key: 'tenant_dashboard',
      event_type: 'step_viewed',
      tour_version: '3',
      step_id: 'search',
      current_step: 1,
      total_steps: 5,
    });

    assert.equal(result.deduplicated, true);
    assert.equal(result.state.current_step, 1);
  });

  assert.equal(stateWrites, 0);
});

test('an event ID collision with different content is rejected', async () => {
  await withMockedTourDatabase(async ({ sql }) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}] };
    if (sql.includes('INSERT INTO user_tour_events')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM user_tour_events')) {
      return {
        rows: [{
          tour_key: 'tenant_dashboard',
          event_type: 'completed',
          tour_version: '3',
          step_id: null,
          current_step: null,
          total_steps: null,
        }],
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async () => {
    await assert.rejects(
      recordTourEvent(42, {
        event_id: 'collision-1',
        platform: 'web',
        tour_key: 'tenant_dashboard',
        event_type: 'started',
        tour_version: '3',
      }),
      (error) => error.status === 409 && /different event/i.test(error.message)
    );
  });
});
