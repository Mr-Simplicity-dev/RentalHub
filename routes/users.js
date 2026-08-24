const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, query } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const { uploadPassportLocal, validateFileMagicBytesMiddleware } = require('../config/middleware/upload');
const {
  sensitiveActionLimiter,
  tourEventLimiter,
} = require('../config/middleware/securityRateLimiters');
const { decryptNIN } = require('../config/utils/ninEncryption');
const { checkPasswordBreached } = require('../config/utils/breachCheck');
const credentialRevalidationCtrl = require('../controllers/credentialRevalidationController');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'passports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const LIVE_CAPTURE_SESSION_TTL_MS = 10 * 60 * 1000;
const REQUIRE_LIVE_CAPTURE_SESSION =
  process.env.NODE_ENV === 'production' ||
  process.env.REQUIRE_LIVE_CAPTURE_SESSION === 'true';
const liveCaptureSessions = new Map();
const IDENTITY_PHOTO_SCOPED_ROLES = new Set(['admin', 'lga_admin', 'state_admin']);
const IDENTITY_PHOTO_LGA_ROLES = new Set(['admin', 'lga_admin']);

router.get('/credential-revalidations', authenticate, credentialRevalidationCtrl.getMyRequests);
router.post('/credential-revalidations/:requestId/submit', authenticate, sensitiveActionLimiter, credentialRevalidationCtrl.submitRequest);

const getSessionKey = (userId, token) => `${userId}:${token}`;

const pruneExpiredCaptureSessions = () => {
  const now = Date.now();
  for (const [key, value] of liveCaptureSessions.entries()) {
    if (!value || value.expiresAt <= now) {
      liveCaptureSessions.delete(key);
    }
  }
};

const createLiveCaptureSession = (userId) => {
  pruneExpiredCaptureSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const key = getSessionKey(userId, token);

  liveCaptureSessions.set(key, {
    expiresAt: Date.now() + LIVE_CAPTURE_SESSION_TTL_MS,
  });

  return token;
};

const consumeLiveCaptureSession = (userId, token) => {
  if (!token || typeof token !== 'string') return false;

  pruneExpiredCaptureSessions();
  const key = getSessionKey(userId, token);
  const session = liveCaptureSessions.get(key);
  if (!session) return false;

  liveCaptureSessions.delete(key);
  return session.expiresAt > Date.now();
};

const canViewPassportPhoto = async ({ requester, ownerId, filename }) => {
  const storedPhoto = await db.query(
    `SELECT passport_photo_url
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [ownerId]
  );

  const expectedUrl = `/uploads/passports/${filename}`;
  if (
    !storedPhoto.rows.length ||
    String(storedPhoto.rows[0].passport_photo_url || '') !== expectedUrl
  ) {
    return false;
  }

  if (Number(requester?.id) === Number(ownerId)) return true;

  const role = String(requester?.user_type || '').trim().toLowerCase();
  if (role === 'super_admin') return true;
  if (!IDENTITY_PHOTO_SCOPED_ROLES.has(role)) return false;

  const assignedState = String(requester?.assigned_state || '').trim();
  const assignedCity = IDENTITY_PHOTO_LGA_ROLES.has(role)
    ? String(requester?.assigned_city || '').trim()
    : null;

  if (!assignedState || (IDENTITY_PHOTO_LGA_ROLES.has(role) && !assignedCity)) {
    return false;
  }

  const scopeResult = await db.query(
    `SELECT EXISTS (
       SELECT 1
       FROM users target
       WHERE target.id = $1
         AND (
           EXISTS (
             SELECT 1
             FROM states preferred_state
             WHERE preferred_state.id = target.preferred_state_id
               AND LOWER(TRIM(preferred_state.state_name)) = LOWER(TRIM($2))
           )
           OR EXISTS (
             SELECT 1
             FROM properties scoped_property
             JOIN states property_state ON property_state.id = scoped_property.state_id
             WHERE (scoped_property.user_id = target.id OR scoped_property.landlord_id = target.id)
               AND LOWER(TRIM(property_state.state_name)) = LOWER(TRIM($2))
           )
           OR EXISTS (
             SELECT 1
             FROM applications scoped_application
             JOIN properties application_property ON application_property.id = scoped_application.property_id
             JOIN states application_state ON application_state.id = application_property.state_id
             WHERE scoped_application.tenant_id = target.id
               AND LOWER(TRIM(application_state.state_name)) = LOWER(TRIM($2))
           )
         )
         AND (
           $3::text IS NULL
           OR LOWER(TRIM(COALESCE(target.preferred_lga_name, ''))) = LOWER(TRIM($3))
           OR EXISTS (
             SELECT 1
             FROM properties scoped_property
             JOIN states property_state ON property_state.id = scoped_property.state_id
             WHERE (scoped_property.user_id = target.id OR scoped_property.landlord_id = target.id)
               AND LOWER(TRIM(property_state.state_name)) = LOWER(TRIM($2))
               AND LOWER(TRIM(COALESCE(scoped_property.lga_name, ''))) = LOWER(TRIM($3))
           )
           OR EXISTS (
             SELECT 1
             FROM applications scoped_application
             JOIN properties application_property ON application_property.id = scoped_application.property_id
             JOIN states application_state ON application_state.id = application_property.state_id
             WHERE scoped_application.tenant_id = target.id
               AND LOWER(TRIM(application_state.state_name)) = LOWER(TRIM($2))
               AND LOWER(TRIM(COALESCE(application_property.lga_name, ''))) = LOWER(TRIM($3))
           )
         )
     ) AS allowed`,
    [ownerId, assignedState, assignedCity]
  );

  return scopeResult.rows[0]?.allowed === true;
};

const cleanupUploadedFile = (file) => {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (err) {
    req.logger.warn('Failed to clean up uploaded file:', err.message);
  }
};

let identitySchemaReady = false;
const ensureIdentitySchema = async () => {
  if (identitySchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ALTER COLUMN nin DROP NOT NULL;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_document_type VARCHAR(20) DEFAULT 'nin',
    ADD COLUMN IF NOT EXISTS international_passport_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS nationality VARCHAR(80),
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20);
  `);

  identitySchemaReady = true;
};

let commissionPasswordSchemaReady = false;
const ensureCommissionPasswordSchema = async () => {
  if (commissionPasswordSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS commission_balance_password_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS commission_balance_password_set_at TIMESTAMP;
  `);

  commissionPasswordSchemaReady = true;
};

let tourSchemaPromise = null;
const ensureTourSchema = async () => {
  if (!tourSchemaPromise) {
    tourSchemaPromise = db.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name IN ('user_tour_states', 'user_tour_events')`
    ).then((result) => {
      const columnsByTable = result.rows.reduce((tables, row) => {
        if (!tables[row.table_name]) tables[row.table_name] = new Set();
        tables[row.table_name].add(row.column_name);
        return tables;
      }, {});
      const requiredColumns = {
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
      const missing = Object.entries(requiredColumns).flatMap(([table, columns]) =>
        columns
          .filter((column) => !columnsByTable[table]?.has(column))
          .map((column) => `${table}.${column}`)
      );

      if (missing.length) {
        throw new Error(
          `Tour schema is not ready (${missing.join(', ')}). Run the pending database migrations.`
        );
      }

      return true;
    }).catch((error) => {
      tourSchemaPromise = null;
      throw error;
    });
  }

  return tourSchemaPromise;
};

const TOUR_EVENTS = new Set([
  'welcome_shown',
  'started',
  'resumed',
  'replayed',
  'step_viewed',
  'step_completed',
  'step_skipped',
  'action_completed',
  'target_missing',
  'step_unavailable',
  'paused',
  'completed',
  'skipped',
  'dismissed',
]);
const TOUR_EVENT_STATUS = {
  welcome_shown: 'welcome_shown',
  started: 'in_progress',
  resumed: 'in_progress',
  replayed: 'in_progress',
  step_viewed: 'in_progress',
  step_completed: 'in_progress',
  step_skipped: 'in_progress',
  action_completed: 'in_progress',
  target_missing: 'in_progress',
  step_unavailable: 'in_progress',
  paused: 'paused',
  completed: 'completed',
  skipped: 'skipped',
  dismissed: 'dismissed',
};
const TERMINAL_TOUR_STATUSES = new Set(['completed', 'skipped', 'dismissed']);
const TOUR_RESTART_EVENTS = new Set(['replayed']);
const TOUR_SESSION_START_EVENTS = new Set(['started', 'resumed', 'replayed']);
const TOUR_PROGRESS_EVENTS = new Set([
  'started',
  'resumed',
  'replayed',
  'step_viewed',
  'step_completed',
  'step_skipped',
  'action_completed',
  'target_missing',
  'step_unavailable',
  'paused',
  'completed',
  'skipped',
  'dismissed',
]);

const TOUR_PLATFORM_ALIASES = new Map([
  ['legacy', 'legacy'],
  ['web', 'web'],
  ['browser', 'web'],
  ['pwa', 'web'],
  ['mobile', 'mobile'],
  ['native', 'mobile'],
  ['android', 'mobile'],
  ['ios', 'mobile'],
]);

const tourInputError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const normalizeTourText = (
  value,
  fallback = null,
  { field = 'Tour value', maxLength = null, lowercase = false } = {}
) => {
  const text = String(value ?? '').trim();
  if (maxLength && text.length > maxLength) {
    throw tourInputError(`${field} must be ${maxLength} characters or fewer`);
  }
  if (!text) return fallback;
  return lowercase ? text.toLowerCase() : text;
};

const normalizeTourPlatform = (value, fallback = 'legacy') => {
  if (value === undefined || value === null) {
    return fallback;
  }

  const text = normalizeTourText(value, null, {
    field: 'Tour platform',
    maxLength: 20,
    lowercase: true,
  });
  const platform = TOUR_PLATFORM_ALIASES.get(text);

  if (!platform) {
    throw tourInputError('Tour platform must be web, mobile, or legacy');
  }

  return platform;
};

const normalizeTourKey = (value, fallback = 'default') => {
  const text = normalizeTourText(value, fallback, {
    field: 'Tour key',
    maxLength: 120,
    lowercase: true,
  });
  if (text && !/^[a-z0-9][a-z0-9._:-]*$/.test(text)) {
    throw tourInputError('Tour key contains unsupported characters');
  }
  return text || fallback;
};

const normalizeTourInteger = (value, field) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') {
    throw tourInputError(`${field} must be a non-negative integer`);
  }

  const parsed = Number(value);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > 2147483647
  ) {
    throw tourInputError(`${field} must be a non-negative integer`);
  }
  return parsed;
};

const normalizeTourObject = (value, field, maxBytes) => {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw tourInputError(`${field} must be a JSON object`);
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_error) {
    throw tourInputError(`${field} must be valid JSON`);
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw tourInputError(`${field} must be ${Math.floor(maxBytes / 1024)} KB or smaller`);
  }

  return JSON.parse(serialized);
};

const normalizeTourLocale = (value, fallback = null) => {
  const text = normalizeTourText(value, fallback, {
    field: 'Tour locale',
    maxLength: 35,
  });
  if (!text) return fallback;

  try {
    return Intl.getCanonicalLocales(text.replace(/_/g, '-'))[0];
  } catch (_error) {
    throw tourInputError('Tour locale must be a valid language tag');
  }
};

const normalizeTourCode = (value, field, maxLength = 120) => {
  const text = normalizeTourText(value, null, {
    field,
    maxLength,
    lowercase: true,
  });
  if (!text) return null;
  if (!/^[a-z0-9][a-z0-9._:-]*$/.test(text)) {
    throw tourInputError(`${field} contains unsupported characters`);
  }
  return text;
};

const normalizeTourTimestamp = (value, field = 'Client event time') => {
  if (value === undefined || value === null || value === '') return null;
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw tourInputError(`${field} must be a valid ISO-8601 timestamp`);
  }

  const now = Date.now();
  if (timestamp.getTime() > now + 5 * 60 * 1000) {
    throw tourInputError(`${field} cannot be more than 5 minutes in the future`);
  }
  return timestamp.toISOString();
};

const normalizeTourRoute = (value) => {
  const route = normalizeTourText(value, null, {
    field: 'Tour route',
    maxLength: 255,
  });
  if (!route) return null;

  // Analytics must not retain query strings or fragments because these can
  // carry search text, payment references, reset tokens, and other PII.
  return route.split(/[?#]/, 1)[0].trim() || null;
};

const compareTourVersions = (left, right) => {
  if (left === right) return 0;
  if (/^\d+$/.test(String(left)) && /^\d+$/.test(String(right))) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    return leftNumber === rightNumber ? 0 : leftNumber > rightNumber ? 1 : -1;
  }
  return null;
};

const serializeTourState = (state) => {
  if (!state) return null;
  const currentStep = state.current_step == null ? null : Number(state.current_step);
  const totalSteps = state.total_steps == null ? null : Number(state.total_steps);
  const stateRevision = state.state_revision == null ? 0 : Number(state.state_revision);
  const canResume = ['in_progress', 'paused'].includes(state.status) && currentStep !== null;

  return {
    ...state,
    current_step: currentStep,
    current_step_id: state.current_step_id || null,
    // Compatibility alias for clients that adopted the original resume draft.
    last_step_id: state.current_step_id || null,
    total_steps: totalSteps,
    state_revision: stateRevision,
    context: state.context && typeof state.context === 'object' ? state.context : {},
    can_resume: canResume,
  };
};

/**
 * Resolve an event into the next resumable cursor without performing I/O.
 * Events are still retained for diagnostics when this returns applied=false,
 * but an older version, session, or sequence can never move the saved cursor.
 */
const deriveTourStateTransition = (state, event) => {
  state = state || {
    status: 'not_started',
    tour_version: event.tourVersion,
    context: {},
  };
  const currentVersion = String(state?.tour_version || event.tourVersion);
  const versionComparison = compareTourVersions(event.tourVersion, currentVersion);
  const sameVersion = event.tourVersion === currentVersion;
  const newerVersion = !sameVersion && versionComparison !== -1;

  if (versionComparison === -1) {
    return { applied: false, reason: 'older_tour_version' };
  }

  if (
    sameVersion &&
    TERMINAL_TOUR_STATUSES.has(state.status) &&
    !TOUR_RESTART_EVENTS.has(event.eventType)
  ) {
    return { applied: false, reason: 'terminal_tour_state' };
  }

  const currentSessionId = state.active_session_id || null;
  const incomingSessionId = event.sessionId || null;
  const sessionChanged = Boolean(
    incomingSessionId && currentSessionId && incomingSessionId !== currentSessionId
  );

  if (sessionChanged && !newerVersion && !TOUR_SESSION_START_EVENTS.has(event.eventType)) {
    return { applied: false, reason: 'inactive_session' };
  }

  const sameSession = Boolean(
    incomingSessionId && currentSessionId && incomingSessionId === currentSessionId
  );
  const lastSequenceNumber = state.last_sequence_number == null
    ? null
    : Number(state.last_sequence_number);
  if (
    sameSession &&
    event.sequenceNumber !== null &&
    lastSequenceNumber !== null &&
    event.sequenceNumber <= lastSequenceNumber
  ) {
    return { applied: false, reason: 'stale_sequence' };
  }

  const resetProgress = newerVersion || TOUR_RESTART_EVENTS.has(event.eventType);
  const cursorEvent = TOUR_PROGRESS_EVENTS.has(event.eventType);
  let currentStep = resetProgress
    ? null
    : state.current_step == null ? null : Number(state.current_step);
  let currentStepId = resetProgress ? null : state.current_step_id || null;
  let totalSteps = resetProgress
    ? null
    : state.total_steps == null ? null : Number(state.total_steps);
  let context = resetProgress
    ? {}
    : state.context && typeof state.context === 'object' ? state.context : {};

  if (cursorEvent && event.currentStep !== null) {
    if (currentStep !== event.currentStep && !event.stepId) {
      currentStepId = null;
    }
    currentStep = event.currentStep;
  }
  if (cursorEvent && event.stepId) {
    currentStepId = event.stepId;
  }
  if (cursorEvent && event.totalSteps !== null) {
    totalSteps = event.totalSteps;
  }
  if (event.contextProvided) {
    context = event.context;
  }

  // Keep the database invariant valid when a newer client reports a shorter
  // tour definition without also reporting a replacement cursor.
  if (currentStep !== null && totalSteps !== null && currentStep >= totalSteps) {
    if (event.currentStep === null) {
      currentStep = null;
      currentStepId = null;
    } else {
      totalSteps = null;
    }
  }

  let status = TOUR_EVENT_STATUS[event.eventType];
  if (
    event.eventType === 'welcome_shown' &&
    ['in_progress', 'paused'].includes(state.status) &&
    !newerVersion
  ) {
    status = state.status;
  }

  const nextSessionId = incomingSessionId || (resetProgress ? null : currentSessionId);
  let nextSequenceNumber = resetProgress || sessionChanged
    ? null
    : lastSequenceNumber;
  if (incomingSessionId && event.sequenceNumber !== null) {
    nextSequenceNumber = event.sequenceNumber;
  }

  return {
    applied: true,
    values: {
      dashboardType: event.dashboardType || state.dashboard_type || null,
      tourVersion: event.tourVersion,
      status,
      currentStep,
      currentStepId,
      totalSteps,
      locale: event.locale || (resetProgress ? null : state.locale || null),
      context,
      activeSessionId: nextSessionId,
      lastSequenceNumber: nextSequenceNumber,
      progressUpdated: cursorEvent,
    },
  };
};

const getTourState = async (userId, { platform = null, tourKey = null } = {}) => {
  await ensureTourSchema();
  const clauses = ['user_id = $1'];
  const values = [userId];

  if (platform) {
    values.push(platform);
    clauses.push(`platform = $${values.length}`);
  }

  if (tourKey) {
    values.push(tourKey);
    clauses.push(`tour_key = $${values.length}`);
  }

  const result = await db.query(
    `SELECT *
     FROM user_tour_states
     WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC
     LIMIT 1`,
    values
  );

  return serializeTourState(result.rows[0] || null);
};

const recordTourEvent = async (userId, payload = {}) => {
  await ensureTourSchema();

  const eventType = normalizeTourText(payload.event_type, null, {
    field: 'Tour event type',
    maxLength: 40,
    lowercase: true,
  });
  if (!TOUR_EVENTS.has(eventType)) {
    throw tourInputError('Invalid tour event type');
  }

  const dashboardType = normalizeTourText(payload.dashboard_type, null, {
    field: 'Dashboard type',
    maxLength: 80,
    lowercase: true,
  });
  const rawMetadata = normalizeTourObject(payload.metadata, 'Tour metadata', 16384);
  const contextProvided = Object.prototype.hasOwnProperty.call(payload, 'context') ||
    Object.prototype.hasOwnProperty.call(rawMetadata, 'context');
  const context = normalizeTourObject(
    payload.context ?? rawMetadata.context,
    'Tour context',
    16384
  );
  const platform = normalizeTourPlatform(payload.platform ?? rawMetadata.platform, 'legacy');
  const tourKey = normalizeTourKey(payload.tour_key, dashboardType || 'default');
  const tourVersion = normalizeTourText(payload.tour_version, '3', {
    field: 'Tour version',
    maxLength: 40,
  });
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(tourVersion)) {
    throw tourInputError('Tour version contains unsupported characters');
  }
  const eventId = normalizeTourCode(payload.event_id, 'Tour event ID', 100);
  const stepId = normalizeTourText(payload.step_id, null, {
    field: 'Tour step ID',
    maxLength: 120,
  });
  const currentStep = normalizeTourInteger(payload.current_step, 'Current step');
  const totalSteps = normalizeTourInteger(payload.total_steps, 'Total steps');
  if (currentStep !== null && totalSteps !== null && currentStep >= totalSteps) {
    throw tourInputError('Current step must be lower than total steps');
  }
  if (['step_viewed', 'step_completed', 'step_skipped'].includes(eventType)) {
    if (currentStep === null || !stepId) {
      throw tourInputError(`${eventType} requires current_step and step_id`);
    }
  }
  if (eventType === 'resumed' && currentStep === null) {
    throw tourInputError('resumed requires current_step');
  }

  const locale = normalizeTourLocale(
    payload.locale ?? context.locale ?? rawMetadata.locale ?? rawMetadata.language,
    null
  );
  const route = normalizeTourRoute(
    payload.route ?? context.route ?? context.screen ?? rawMetadata.route ?? rawMetadata.screen
  );
  const targetId = normalizeTourText(
    payload.target_id ?? context.target_id ?? rawMetadata.target_id,
    null,
    { field: 'Tour target ID', maxLength: 120 }
  );
  const reasonCode = normalizeTourCode(
    payload.reason_code ?? context.reason_code ?? context.reason ?? rawMetadata.reason_code ?? rawMetadata.reason,
    'Tour reason code',
    80
  );
  const sessionId = normalizeTourCode(
    payload.session_id ?? context.session_id ?? rawMetadata.session_id,
    'Tour session ID',
    100
  );
  const sequenceNumber = normalizeTourInteger(
    payload.sequence_number ?? context.sequence_number ?? rawMetadata.sequence_number,
    'Tour sequence number'
  );
  if (sequenceNumber !== null && !sessionId) {
    throw tourInputError('Tour session ID is required when sequence number is provided');
  }
  const durationMs = normalizeTourInteger(
    payload.duration_ms ?? rawMetadata.duration_ms,
    'Tour duration'
  );
  if (durationMs !== null && durationMs > 86400000) {
    throw tourInputError('Tour duration must be 24 hours or fewer');
  }
  const clientCreatedAt = normalizeTourTimestamp(
    payload.client_created_at ?? rawMetadata.client_created_at
  );

  const metadata = {
    ...rawMetadata,
    platform,
    ...(locale ? { locale } : {}),
  };
  const serializedMetadata = JSON.stringify(metadata);
  if (Buffer.byteLength(serializedMetadata, 'utf8') > 16384) {
    throw tourInputError('Tour metadata must be 16 KB or smaller');
  }
  const serializedContext = JSON.stringify(context);

  const startedIncrement = eventType === 'started' ? 1 : 0;
  const completedIncrement = eventType === 'completed' ? 1 : 0;
  const skippedIncrement = eventType === 'skipped' ? 1 : 0;
  const dismissedIncrement = eventType === 'dismissed' ? 1 : 0;
  const replayIncrement = eventType === 'replayed' ? 1 : 0;
  const resumeIncrement = eventType === 'resumed' ? 1 : 0;
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [String(userId), `${platform}:${tourKey}`]
    );

    const eventResult = await client.query(
      `INSERT INTO user_tour_events (
         user_id, platform, tour_key, event_id, event_type, dashboard_type,
         tour_version, step_id, current_step, total_steps, metadata,
         locale, route, target_id, reason_code, session_id, sequence_number,
         duration_ms, client_created_at, context
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb,
         $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb
       )
       ON CONFLICT DO NOTHING
       RETURNING id, event_id`,
      [
        userId,
        platform,
        tourKey,
        eventId,
        eventType,
        dashboardType,
        tourVersion,
        stepId,
        currentStep,
        totalSteps,
        serializedMetadata,
        locale,
        route,
        targetId,
        reasonCode,
        sessionId,
        sequenceNumber,
        durationMs,
        clientCreatedAt,
        serializedContext,
      ]
    );

    // A retried request with the same client event ID must not create another
    // analytics row or increment the aggregate counters a second time.
    if (eventResult.rows.length === 0) {
      const lookupByEventId = Boolean(eventId);
      const existingEventResult = await client.query(
        `SELECT tour_key, event_type, tour_version, step_id, current_step, total_steps
         FROM user_tour_events
         WHERE user_id = $1
           AND platform = $2
           AND (
             ($3::text IS NOT NULL AND event_id = $3)
             OR (
               $4::text IS NOT NULL
               AND $5::int IS NOT NULL
               AND tour_key = $6
               AND session_id = $4
               AND sequence_number = $5
             )
           )
         ORDER BY CASE WHEN $3::text IS NOT NULL AND event_id = $3 THEN 0 ELSE 1 END
         LIMIT 1`,
        [userId, platform, eventId, sessionId, sequenceNumber, tourKey]
      );
      const existingEvent = existingEventResult.rows[0];
      const sameEvent = existingEvent
        && existingEvent.tour_key === tourKey
        && existingEvent.event_type === eventType
        && existingEvent.tour_version === tourVersion
        && (existingEvent.step_id || null) === stepId
        && (existingEvent.current_step == null ? null : Number(existingEvent.current_step)) === currentStep
        && (existingEvent.total_steps == null ? null : Number(existingEvent.total_steps)) === totalSteps;
      if (!sameEvent || (!lookupByEventId && !sessionId)) {
        const conflict = new Error('Tour event ID was already used for a different event');
        conflict.status = 409;
        throw conflict;
      }

      const existingState = await client.query(
        `SELECT *
         FROM user_tour_states
         WHERE user_id = $1 AND platform = $2 AND tour_key = $3
         LIMIT 1`,
        [userId, platform, tourKey]
      );
      await client.query('COMMIT');
      return {
        state: serializeTourState(existingState.rows[0] || null),
        deduplicated: true,
      };
    }

    const existingStateResult = await client.query(
      `SELECT *
       FROM user_tour_states
       WHERE user_id = $1 AND platform = $2 AND tour_key = $3
       FOR UPDATE`,
      [userId, platform, tourKey]
    );
    const existingState = existingStateResult.rows[0] || null;
    const transition = deriveTourStateTransition(existingState, {
      eventType,
      dashboardType,
      tourVersion,
      stepId,
      currentStep,
      totalSteps,
      locale,
      context: {
        ...context,
        ...(route ? { route } : {}),
      },
      contextProvided: contextProvided || Boolean(route),
      sessionId,
      sequenceNumber,
    });

    // Keep the analytics row for diagnostics, but never let an older version,
    // inactive session, duplicate sequence, or terminal tour mutate the cursor.
    if (!transition.applied) {
      await client.query('COMMIT');
      return {
        state: serializeTourState(existingState),
        deduplicated: false,
        state_ignored: transition.reason,
      };
    }

    const next = transition.values;
    const status = next.status;
    const updatesProgress = next.progressUpdated;
    const nextCurrentStep = next.currentStep;
    const nextStepId = next.currentStepId;
    const nextTotalSteps = next.totalSteps;
    const nextLocale = next.locale;
    const nextContext = next.context;
    const nextSessionId = next.activeSessionId;
    const nextSequenceNumber = next.lastSequenceNumber;

    let stateResult;
    if (!existingState) {
      stateResult = await client.query(
        `INSERT INTO user_tour_states (
           user_id, platform, tour_key, dashboard_type, tour_version, status,
           current_step, current_step_id, total_steps, progress_updated_at,
           locale, context, last_event_type, last_event_at,
           resume_count, last_resumed_at, active_session_id,
           last_sequence_number, state_revision,
           last_welcome_shown_at, last_started_at, last_completed_at,
           last_dismissed_at, last_skipped_at,
           started_count, completed_count, skipped_count, dismissed_count, replay_count,
           updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, CASE WHEN $10 THEN CURRENT_TIMESTAMP ELSE NULL END,
           $11, $12::jsonb, $13, CURRENT_TIMESTAMP,
           $14, CASE WHEN $13 = 'resumed' THEN CURRENT_TIMESTAMP ELSE NULL END,
           $15, $16, 1,
           CASE WHEN $13 = 'welcome_shown' THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $13 IN ('started', 'replayed', 'resumed') THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $13 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $13 = 'dismissed' THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $13 = 'skipped' THEN CURRENT_TIMESTAMP ELSE NULL END,
           $17, $18, $19, $20, $21,
           CURRENT_TIMESTAMP
         )
         RETURNING *`,
        [
          userId, platform, tourKey, dashboardType, tourVersion, status,
          nextCurrentStep, nextStepId, nextTotalSteps, updatesProgress,
          nextLocale, JSON.stringify(nextContext), eventType, resumeIncrement,
          nextSessionId, nextSequenceNumber,
          startedIncrement, completedIncrement, skippedIncrement,
          dismissedIncrement, replayIncrement,
        ]
      );
    } else {
      stateResult = await client.query(
        `UPDATE user_tour_states
         SET dashboard_type = COALESCE($4, dashboard_type),
             tour_version = $5,
             status = $6,
             current_step = $7,
             current_step_id = $8,
             total_steps = $9,
             progress_updated_at = CASE WHEN $10 THEN CURRENT_TIMESTAMP ELSE progress_updated_at END,
             locale = $11,
             context = $12::jsonb,
             last_event_type = $13,
             last_event_at = CURRENT_TIMESTAMP,
             resume_count = resume_count + $14,
             last_resumed_at = CASE WHEN $13 = 'resumed' THEN CURRENT_TIMESTAMP ELSE last_resumed_at END,
             active_session_id = $15,
             last_sequence_number = $16,
             state_revision = state_revision + 1,
             last_welcome_shown_at = CASE WHEN $13 = 'welcome_shown' THEN CURRENT_TIMESTAMP ELSE last_welcome_shown_at END,
             last_started_at = CASE WHEN $13 IN ('started', 'replayed', 'resumed') THEN CURRENT_TIMESTAMP ELSE last_started_at END,
             last_completed_at = CASE WHEN $13 = 'completed' THEN CURRENT_TIMESTAMP ELSE last_completed_at END,
             last_dismissed_at = CASE WHEN $13 = 'dismissed' THEN CURRENT_TIMESTAMP ELSE last_dismissed_at END,
             last_skipped_at = CASE WHEN $13 = 'skipped' THEN CURRENT_TIMESTAMP ELSE last_skipped_at END,
             started_count = started_count + $17,
             completed_count = completed_count + $18,
             skipped_count = skipped_count + $19,
             dismissed_count = dismissed_count + $20,
             replay_count = replay_count + $21,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND platform = $2 AND tour_key = $3
         RETURNING *`,
        [
          userId, platform, tourKey, dashboardType, tourVersion, status,
          nextCurrentStep, nextStepId, nextTotalSteps, updatesProgress,
          nextLocale, JSON.stringify(nextContext), eventType, resumeIncrement,
          nextSessionId, nextSequenceNumber,
          startedIncrement, completedIncrement, skippedIncrement,
          dismissedIncrement, replayIncrement,
        ]
      );
    }

    await client.query('COMMIT');
    return {
      state: serializeTourState(stateResult.rows[0]),
      deduplicated: false,
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
};

const normalizeCommissionPassword = (value) => String(value || '').trim();

const validateCommissionPassword = (value) => {
  const password = normalizeCommissionPassword(value);
  if (password.length < 6) {
    return 'Commission password must be at least 6 characters';
  }
  if (password.length > 128) {
    return 'Commission password must be 128 characters or fewer';
  }
  return null;
};

const getPasswordRecord = async (userId) => {
  await ensureCommissionPasswordSchema();
  const result = await db.query(
    `SELECT password_hash,
            commission_balance_password_hash,
            commission_balance_password_set_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
};

const verifyLoginPassword = async (userId, password) => {
  const record = await getPasswordRecord(userId);
  if (!record?.password_hash) return false;
  return bcrypt.compare(String(password || ''), record.password_hash);
};

const setCommissionPassword = async (userId, commissionPassword) => {
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(
    normalizeCommissionPassword(commissionPassword),
    salt
  );

  await db.query(
    `UPDATE users
     SET commission_balance_password_hash = $1,
         commission_balance_password_set_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, userId]
  );
};

// Commission balance password status
router.get('/commission-password/status', authenticate, async (req, res) => {
  try {
    const record = await getPasswordRecord(req.user.id);

    return res.json({
      success: true,
      data: {
        has_commission_password: Boolean(record?.commission_balance_password_hash),
        set_at: record?.commission_balance_password_set_at || null,
      },
    });
  } catch (error) {
    req.logger.error('Commission password status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load commission password status',
    });
  }
});

// Set commission balance password for the first time
router.post('/commission-password/setup', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { login_password, commission_password } = req.body || {};
    const validationError = validateCommissionPassword(commission_password);

    if (!login_password || !commission_password) {
      return res.status(400).json({
        success: false,
        message: 'Login password and commission password are required',
      });
    }

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const record = await getPasswordRecord(userId);
    if (record?.commission_balance_password_hash) {
      return res.status(409).json({
        success: false,
        message: 'Commission password is already set. Use change or reset instead.',
      });
    }

    const loginPasswordValid = await verifyLoginPassword(userId, login_password);
    if (!loginPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Login password is incorrect',
      });
    }

    await setCommissionPassword(userId, commission_password);

    return res.json({
      success: true,
      message: 'Commission password set successfully',
    });
  } catch (error) {
    req.logger.error('Commission password setup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to set commission password',
    });
  }
});

// Verify commission balance password for reveal actions
router.post('/commission-password/verify', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const { commission_password } = req.body || {};
    if (!commission_password) {
      return res.status(400).json({
        success: false,
        message: 'Commission password is required',
      });
    }

    const record = await getPasswordRecord(req.user.id);
    if (!record?.commission_balance_password_hash) {
      return res.status(409).json({
        success: false,
        code: 'COMMISSION_PASSWORD_NOT_SET',
        message: 'Set a commission password before revealing this balance',
      });
    }

    const isValid = await bcrypt.compare(
      normalizeCommissionPassword(commission_password),
      record.commission_balance_password_hash
    );
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect commission password',
      });
    }

    return res.json({
      success: true,
      message: 'Commission password verified',
    });
  } catch (error) {
    req.logger.error('Commission password verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify commission password',
    });
  }
});

// Change commission balance password when the current commission password is known
router.put('/commission-password/change', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      current_commission_password,
      new_commission_password,
    } = req.body || {};
    const validationError = validateCommissionPassword(new_commission_password);

    if (!current_commission_password || !new_commission_password) {
      return res.status(400).json({
        success: false,
        message: 'Current and new commission passwords are required',
      });
    }

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const record = await getPasswordRecord(userId);
    if (!record?.commission_balance_password_hash) {
      return res.status(409).json({
        success: false,
        code: 'COMMISSION_PASSWORD_NOT_SET',
        message: 'Set a commission password before changing it',
      });
    }

    const currentPasswordValid = await bcrypt.compare(
      normalizeCommissionPassword(current_commission_password),
      record.commission_balance_password_hash
    );
    if (!currentPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Current commission password is incorrect',
      });
    }

    await setCommissionPassword(userId, new_commission_password);

    return res.json({
      success: true,
      message: 'Commission password changed successfully',
    });
  } catch (error) {
    req.logger.error('Commission password change error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change commission password',
    });
  }
});

// Reset forgotten commission balance password with the normal login password
router.post('/commission-password/reset', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { login_password, new_commission_password } = req.body || {};
    const validationError = validateCommissionPassword(new_commission_password);

    if (!login_password || !new_commission_password) {
      return res.status(400).json({
        success: false,
        message: 'Login password and new commission password are required',
      });
    }

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const loginPasswordValid = await verifyLoginPassword(userId, login_password);
    if (!loginPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Login password is incorrect',
      });
    }

    await setCommissionPassword(userId, new_commission_password);

    return res.json({
      success: true,
      message: 'Commission password reset successfully',
    });
  } catch (error) {
    req.logger.error('Commission password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset commission password',
    });
  }
});

router.get('/tour', authenticate, async (req, res) => {
  try {
    const platform = req.query.platform == null
      ? 'legacy'
      : normalizeTourPlatform(req.query.platform);
    const dashboardType = normalizeTourText(
      req.query.dashboard_type,
      null,
      {
        field: 'Dashboard type',
        maxLength: 80,
        lowercase: true,
      }
    );
    const tourKey = req.query.tour_key == null && !dashboardType
      ? null
      : normalizeTourKey(req.query.tour_key, dashboardType || 'default');
    const state = await getTourState(req.user.id, {
      platform,
      tourKey,
    });
    const serializedState = serializeTourState(state);

    return res.json({
      success: true,
      data: serializedState || {
        user_id: req.user.id,
        platform,
        tour_key: tourKey || dashboardType || 'default',
        dashboard_type: dashboardType,
        status: 'not_started',
        tour_version: '3',
        current_step: null,
        current_step_id: null,
        last_step_id: null,
        total_steps: null,
        progress_updated_at: null,
        locale: null,
        context: {},
        can_resume: false,
        state_revision: 0,
        resume_count: 0,
        active_session_id: null,
        last_sequence_number: null,
        last_event_type: null,
        last_event_at: null,
        last_resumed_at: null,
        started_count: 0,
        completed_count: 0,
        skipped_count: 0,
        dismissed_count: 0,
        replay_count: 0,
      },
    });
  } catch (error) {
    req.logger.error('Tour state load error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to load tour state',
    });
  }
});

router.post('/tour/events', authenticate, tourEventLimiter, async (req, res) => {
  try {
    const result = await recordTourEvent(req.user.id, req.body || {});

    return res.status(result.deduplicated ? 200 : 201).json({
      success: true,
      data: result.state,
      deduplicated: result.deduplicated,
      ...(result.state_ignored ? { state_ignored: result.state_ignored } : {}),
    });
  } catch (error) {
    req.logger.error('Tour event record error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to record tour event',
    });
  }
});

const buildTourAnalyticsWhere = (filters, source = 'events') => {
  const isState = source === 'states';
  const alias = isState ? 'states' : 'events';
  const timestampColumn = isState ? 'updated_at' : 'created_at';
  const values = [filters.days];
  const clauses = [
    `${alias}.${timestampColumn} >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')`,
  ];
  const addFilter = (column, value) => {
    if (value === null || value === undefined) return;
    values.push(value);
    clauses.push(`${alias}.${column} = $${values.length}`);
  };

  addFilter('platform', filters.platform);
  addFilter('tour_key', filters.tourKey);
  addFilter('dashboard_type', filters.dashboardType);
  addFilter('locale', filters.locale);

  return {
    sql: clauses.join(' AND '),
    values,
  };
};

const toTourMetricNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const calculateTourRate = (numerator, denominator) => {
  const top = toTourMetricNumber(numerator);
  const bottom = toTourMetricNumber(denominator);
  return bottom > 0
    ? Number(Math.min(100, (top / bottom) * 100).toFixed(1))
    : 0;
};

const normalizeTourMetricRow = (row, fields) => {
  const normalized = { ...row };
  fields.forEach((field) => {
    normalized[field] = toTourMetricNumber(row?.[field]);
  });
  return normalized;
};

router.get('/tour/analytics', authenticate, [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
  query('platform').optional().isLength({ max: 20 }).withMessage('Platform must be 20 characters or fewer'),
  query('tour_key').optional().isLength({ max: 120 }).withMessage('Tour key must be 120 characters or fewer'),
  query('dashboard_type').optional().isLength({ max: 80 }).withMessage('Dashboard type must be 80 characters or fewer'),
  query('locale').optional().isLength({ max: 35 }).withMessage('Locale must be 35 characters or fewer'),
  validateRequest,
], async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.user_type)) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
      });
    }

    await ensureTourSchema();
    const days = Number(req.query.days || 30);
    const platform = req.query.platform == null
      ? null
      : normalizeTourPlatform(req.query.platform, null);
    const tourKey = req.query.tour_key == null
      ? null
      : normalizeTourKey(req.query.tour_key);
    const dashboardType = normalizeTourText(req.query.dashboard_type, null, {
      field: 'Dashboard type',
      maxLength: 80,
      lowercase: true,
    });
    const locale = normalizeTourLocale(req.query.locale, null);
    const filters = { days, platform, tourKey, dashboardType, locale };
    const eventWhere = buildTourAnalyticsWhere(filters, 'events');
    const stateWhere = buildTourAnalyticsWhere(filters, 'states');

    const [
      eventOverviewResult,
      stateOverviewResult,
      summaryResult,
      dailyResult,
      platformResult,
      tourResult,
      tourProgressResult,
      stepResult,
      localeResult,
      statusResult,
      issueResult,
    ] = await Promise.all([
      db.query(
        `SELECT
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           COUNT(DISTINCT events.user_id) FILTER (
             WHERE events.event_type IN (
               'started', 'replayed', 'resumed', 'step_viewed',
               'step_completed', 'action_completed', 'completed', 'skipped', 'dismissed'
             )
           )::int AS engaged_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'welcome_shown')::int AS welcome_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type IN ('started', 'replayed'))::int AS started_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'resumed')::int AS resumed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'completed')::int AS completed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'skipped')::int AS skipped_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'dismissed')::int AS dismissed_users,
           COUNT(*) FILTER (WHERE events.event_type = 'target_missing')::int AS target_missing_events,
           COUNT(*) FILTER (WHERE events.event_type = 'step_unavailable')::int AS step_unavailable_events
         FROM user_tour_events events
         WHERE ${eventWhere.sql}`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           COUNT(*)::int AS tracked_tours,
           COUNT(*) FILTER (WHERE states.status IN ('in_progress', 'paused'))::int AS active_in_progress,
           COUNT(*) FILTER (
             WHERE states.status IN ('in_progress', 'paused')
               AND states.current_step IS NOT NULL
           )::int AS resumable_tours,
           COUNT(*) FILTER (WHERE states.status = 'paused')::int AS paused_tours,
           ROUND(COALESCE(AVG(
             CASE
               WHEN states.status = 'completed' THEN 100.0
               WHEN states.total_steps > 0 AND states.current_step IS NOT NULL THEN
                 LEAST(100.0, GREATEST(0.0, (states.current_step::numeric + 1) * 100.0 / states.total_steps))
               ELSE 0.0
             END
           ), 0), 1)::float AS average_progress_percent
         FROM user_tour_states states
         WHERE ${stateWhere.sql}`,
        stateWhere.values
      ),
      db.query(
        `SELECT
           events.event_type,
           COUNT(*)::int AS event_count,
           COUNT(DISTINCT events.user_id)::int AS unique_users
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
         GROUP BY events.event_type
         ORDER BY events.event_type`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           TO_CHAR(DATE(events.created_at), 'YYYY-MM-DD') AS event_date,
           events.event_type,
           COUNT(*)::int AS event_count,
           COUNT(DISTINCT events.user_id)::int AS unique_users
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
         GROUP BY DATE(events.created_at), events.event_type
         ORDER BY event_date DESC, events.event_type`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           events.platform,
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           COUNT(DISTINCT events.user_id) FILTER (
             WHERE events.event_type IN (
               'started', 'replayed', 'resumed', 'step_viewed',
               'step_completed', 'action_completed', 'completed', 'skipped', 'dismissed'
             )
           )::int AS engaged_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type IN ('started', 'replayed'))::int AS started_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'resumed')::int AS resumed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'completed')::int AS completed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'skipped')::int AS skipped_users
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
         GROUP BY events.platform
         ORDER BY events.platform`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           events.platform,
           events.tour_key,
           COALESCE(events.dashboard_type, events.tour_key) AS dashboard_type,
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           COUNT(DISTINCT events.user_id) FILTER (
             WHERE events.event_type IN (
               'started', 'replayed', 'resumed', 'step_viewed',
               'step_completed', 'action_completed', 'completed', 'skipped', 'dismissed'
             )
           )::int AS engaged_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type IN ('started', 'replayed'))::int AS started_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'resumed')::int AS resumed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'completed')::int AS completed_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'skipped')::int AS skipped_users
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
         GROUP BY events.platform, events.tour_key, COALESCE(events.dashboard_type, events.tour_key)
         ORDER BY events.platform, events.tour_key`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           states.platform,
           states.tour_key,
           ROUND(COALESCE(AVG(
             CASE
               WHEN states.status = 'completed' THEN 100.0
               WHEN states.total_steps > 0 AND states.current_step IS NOT NULL THEN
                 LEAST(100.0, GREATEST(0.0, (states.current_step::numeric + 1) * 100.0 / states.total_steps))
               ELSE 0.0
             END
           ), 0), 1)::float AS average_progress_percent
         FROM user_tour_states states
         WHERE ${stateWhere.sql}
         GROUP BY states.platform, states.tour_key`,
        stateWhere.values
      ),
      db.query(
        `SELECT
           events.platform,
           events.tour_key,
           events.step_id,
           MAX(events.current_step)::int AS step_number,
           MAX(events.target_id) AS target_id,
           COUNT(*) FILTER (WHERE events.event_type = 'step_viewed')::int AS views,
           COUNT(*) FILTER (WHERE events.event_type = 'step_completed')::int AS completions,
           COUNT(*) FILTER (WHERE events.event_type = 'action_completed')::int AS action_completions,
           COUNT(*) FILTER (WHERE events.event_type IN ('step_skipped', 'skipped'))::int AS skips,
           COUNT(*) FILTER (WHERE events.event_type = 'target_missing')::int AS target_missing,
           COUNT(*) FILTER (WHERE events.event_type = 'step_unavailable')::int AS unavailable,
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           ROUND(AVG(events.duration_ms) FILTER (WHERE events.duration_ms IS NOT NULL), 1)::float AS average_duration_ms
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
           AND events.step_id IS NOT NULL
         GROUP BY events.platform, events.tour_key, events.step_id
         ORDER BY events.platform, events.tour_key, step_number, events.step_id`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           COALESCE(events.locale, 'unknown') AS locale,
           COUNT(*)::int AS event_count,
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           COUNT(DISTINCT events.user_id) FILTER (WHERE events.event_type = 'completed')::int AS completed_users
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
         GROUP BY COALESCE(events.locale, 'unknown')
         ORDER BY event_count DESC, locale`,
        eventWhere.values
      ),
      db.query(
        `SELECT
           states.status,
           COUNT(*)::int AS tour_count,
           COUNT(DISTINCT states.user_id)::int AS unique_users
         FROM user_tour_states states
         WHERE ${stateWhere.sql}
         GROUP BY states.status
         ORDER BY states.status`,
        stateWhere.values
      ),
      db.query(
        `SELECT
           events.platform,
           events.tour_key,
           events.event_type,
           events.step_id,
           events.target_id,
           events.reason_code,
           events.route,
           COUNT(*)::int AS event_count,
           COUNT(DISTINCT events.user_id)::int AS unique_users,
           MAX(events.created_at) AS last_seen_at
         FROM user_tour_events events
         WHERE ${eventWhere.sql}
           AND events.event_type IN ('target_missing', 'step_unavailable', 'step_skipped')
         GROUP BY
           events.platform,
           events.tour_key,
           events.event_type,
           events.step_id,
           events.target_id,
           events.reason_code,
           events.route
         ORDER BY event_count DESC, last_seen_at DESC
         LIMIT 100`,
        eventWhere.values
      ),
    ]);

    const overviewEvents = normalizeTourMetricRow(eventOverviewResult.rows[0] || {}, [
      'unique_users',
      'engaged_users',
      'welcome_users',
      'started_users',
      'resumed_users',
      'completed_users',
      'skipped_users',
      'dismissed_users',
      'target_missing_events',
      'step_unavailable_events',
    ]);
    const overviewState = normalizeTourMetricRow(stateOverviewResult.rows[0] || {}, [
      'tracked_tours',
      'active_in_progress',
      'resumable_tours',
      'paused_tours',
      'average_progress_percent',
    ]);
    const overview = {
      ...overviewEvents,
      ...overviewState,
      completion_rate: calculateTourRate(
        overviewEvents.completed_users,
        overviewEvents.engaged_users
      ),
      skip_rate: calculateTourRate(
        overviewEvents.skipped_users,
        overviewEvents.engaged_users
      ),
      dismissal_rate: calculateTourRate(
        overviewEvents.dismissed_users,
        overviewEvents.engaged_users || overviewEvents.welcome_users
      ),
    };
    const byPlatform = platformResult.rows.map((row) => {
      const normalized = normalizeTourMetricRow(row, [
        'unique_users',
        'engaged_users',
        'started_users',
        'resumed_users',
        'completed_users',
        'skipped_users',
      ]);
      return {
        ...normalized,
        completion_rate: calculateTourRate(normalized.completed_users, normalized.engaged_users),
        skip_rate: calculateTourRate(normalized.skipped_users, normalized.engaged_users),
      };
    });
    const progressByTour = new Map(
      tourProgressResult.rows.map((row) => [
        `${row.platform}\u0000${row.tour_key}`,
        toTourMetricNumber(row.average_progress_percent),
      ])
    );
    const byTour = tourResult.rows.map((row) => {
      const normalized = normalizeTourMetricRow(row, [
        'unique_users',
        'engaged_users',
        'started_users',
        'resumed_users',
        'completed_users',
        'skipped_users',
      ]);
      return {
        ...normalized,
        completion_rate: calculateTourRate(normalized.completed_users, normalized.engaged_users),
        skip_rate: calculateTourRate(normalized.skipped_users, normalized.engaged_users),
        average_progress_percent: progressByTour.get(
          `${row.platform}\u0000${row.tour_key}`
        ) || 0,
      };
    });
    const steps = stepResult.rows.map((row) => {
      const normalized = normalizeTourMetricRow(row, [
        'step_number',
        'views',
        'completions',
        'action_completions',
        'skips',
        'target_missing',
        'unavailable',
        'unique_users',
        'average_duration_ms',
      ]);
      return {
        ...normalized,
        completion_rate: calculateTourRate(normalized.completions, normalized.views),
        action_rate: calculateTourRate(normalized.action_completions, normalized.views),
        problem_rate: calculateTourRate(
          normalized.target_missing + normalized.unavailable + normalized.skips,
          normalized.views
        ),
      };
    });
    const problems = steps
      .map((step) => ({
        platform: step.platform,
        tour_key: step.tour_key,
        step_id: step.step_id,
        target_id: step.target_id,
        target_missing: step.target_missing,
        unavailable: step.unavailable,
        skips: step.skips,
        total_problems: step.target_missing + step.unavailable + step.skips,
      }))
      .filter((problem) => problem.total_problems > 0)
      .sort((left, right) => right.total_problems - left.total_problems);

    return res.json({
      success: true,
      data: {
        days,
        filters: {
          platform,
          tour_key: tourKey,
          dashboard_type: dashboardType,
          locale,
        },
        overview,
        summary: summaryResult.rows.map((row) => normalizeTourMetricRow(
          row,
          ['event_count', 'unique_users']
        )),
        daily: dailyResult.rows.map((row) => normalizeTourMetricRow(
          row,
          ['event_count', 'unique_users']
        )),
        by_platform: byPlatform,
        by_tour: byTour,
        steps,
        locales: localeResult.rows.map((row) => {
          const normalized = normalizeTourMetricRow(
            row,
            ['event_count', 'unique_users', 'completed_users']
          );
          return {
            ...normalized,
            completion_rate: calculateTourRate(
              normalized.completed_users,
              normalized.unique_users
            ),
          };
        }),
        statuses: statusResult.rows.map((row) => normalizeTourMetricRow(
          row,
          ['tour_count', 'unique_users']
        )),
        problems,
        issues: issueResult.rows.map((row) => normalizeTourMetricRow(
          row,
          ['event_count', 'unique_users']
        )),
      },
    });
  } catch (error) {
    req.logger.error('Tour analytics error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to load tour analytics',
    });
  }
});


// Get user profile by ID (public info only — requires auth, returns own profile or limited public info)
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    if (String(req.user.id) !== String(userId)) {
      return res.status(200).json({
        success: true,
        data: { id: Number(userId), public: true }
      });
    }

    const result = await db.query(
      `SELECT id, user_type, full_name, created_at,
              identity_verified
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile'
    });
  }
});

// Update user profile
router.put('/profile', authenticate, [
  body('full_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 255 }).withMessage('Full name must be 2-255 characters'),
  body('phone').optional({ checkFalsy: true }).trim().customSanitizer((value) => String(value || '').replace(/\s+/g, '')).matches(/^\+?\d{10,15}$/).withMessage('Phone must be 10-15 digits, optional +'),
  body('bio').optional({ checkFalsy: true }).trim().customSanitizer(v => v ? v.replace(/<[^>]*>/g, '') : v).isLength({ max: 5000 }).withMessage('Bio must be under 5000 characters'),
  validateRequest,
], async (req, res) => {
  try {
    const userId = req.user.id;

    const allowedColumns = new Set(['full_name', 'phone', 'bio', 'avatar_url']);
    const updates = [];
    const params = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedColumns.has(key)) {
        updates.push(`${key} = $${paramCount}`);
        params.push(value);
        paramCount++;
        if (key === 'phone') {
          updates.push('phone_verified = FALSE');
        }
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await db.query(query, params);

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Remove sensitive data
    delete result.rows[0].password_hash;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: result.rows[0]
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// Change password
router.put('/change-password', authenticate, sensitiveActionLimiter, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password')
    .isLength({ min: 10 })
    .withMessage('New password must be at least 10 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{10,}$/)
    .withMessage('New password must include uppercase, lowercase, number, and special character'),
  validateRequest,
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    // Get current password hash
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    // Verify current password
    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Non-blocking breach check
    checkPasswordBreached(new_password).then(breached => {
      if (breached) req.logger.warn('Breached password used during password change', { userId });
    }).catch(() => {});

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const new_password_hash = await bcrypt.hash(new_password, salt);

    // Update password and invalidate existing tokens
    await db.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [new_password_hash, userId]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

// Get verification status
router.get('/verification/status', authenticate, async (req, res) => {
  try {
    await ensureIdentitySchema();

    const userId = req.user.id;

    const result = await db.query(
      `SELECT email_verified, phone_verified, nin_verified,
              identity_verified, passport_photo_url, nin,
              identity_document_type, international_passport_number,
              identity_verification_status
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    const nimcRequired = process.env.REQUIRE_NIMC_VERIFICATION === 'true';
    const hasIdentityNumber =
      user.identity_document_type === 'passport'
        ? !!user.international_passport_number
        : !!user.nin;
    const ninStepComplete =
      user.identity_document_type !== 'nin' ||
      !nimcRequired ||
      user.nin_verified;

    const status = {
      identity_document_type: user.identity_document_type || 'nin',
      email: user.email_verified,
      phone: user.phone_verified,
      nin: user.nin_verified,
      has_identity_number: hasIdentityNumber,
      passport: !!user.passport_photo_url,
      identity: user.identity_verified,
      review_status:
        user.identity_verification_status ||
        (user.identity_verified
          ? 'verified'
          : user.passport_photo_url && hasIdentityNumber
            ? 'pending'
            : 'not_submitted'),
      overall_complete: user.email_verified && 
                        user.phone_verified && 
                        ninStepComplete && 
                        user.identity_verified &&
                        !!user.passport_photo_url &&
                        hasIdentityNumber
    };

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get verification status'
    });
  }
});

// Create a one-time live-capture session for passport upload
router.post('/verification/live-capture/session', authenticate, async (req, res) => {
  try {
    const token = createLiveCaptureSession(req.user.id);

    res.json({
      success: true,
      data: {
        token,
        expires_in_seconds: Math.floor(LIVE_CAPTURE_SESSION_TTL_MS / 1000),
      },
    });
  } catch (error) {
    req.logger.error('Create live capture session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create live capture session',
    });
  }
});

// Delete account (soft delete — no cascade data loss)
router.delete('/account', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password required to delete account'
      });
    }

    // Verify password
    const result = await db.query(
      'SELECT password_hash, user_type FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Check for active data before deletion
    const activeDataCheck = await db.query(
      `SELECT
         EXISTS(SELECT 1 FROM properties WHERE landlord_id = $1 AND is_available = TRUE) AS has_active_properties,
         EXISTS(SELECT 1 FROM tenancies WHERE tenant_id = $1 AND status = 'active') AS has_active_tenancies,
         EXISTS(SELECT 1 FROM disputes WHERE (complainant_id = $1 OR respondent_id = $1) AND status IN ('pending', 'investigating', 'escalated')) AS has_active_disputes,
         EXISTS(SELECT 1 FROM payments WHERE user_id = $1 AND payment_status = 'pending') AS has_pending_payments`,
      [userId]
    );
    const activeWarnings = activeDataCheck.rows[0];

    if (activeWarnings.has_active_properties || activeWarnings.has_active_tenancies ||
        activeWarnings.has_active_disputes || activeWarnings.has_pending_payments) {
      const warnings = [];
      if (activeWarnings.has_active_properties) warnings.push('active property listings');
      if (activeWarnings.has_active_tenancies) warnings.push('active tenancies');
      if (activeWarnings.has_active_disputes) warnings.push('ongoing disputes');
      if (activeWarnings.has_pending_payments) warnings.push('pending payments');

      return res.status(409).json({
        success: false,
        message: `Cannot delete account with ${warnings.join(', ')}. Please resolve these first or contact support.`,
        code: 'ACCOUNT_HAS_ACTIVE_DATA'
      });
    }

    // Soft delete: mark as deleted rather than cascade-removing
    await db.query(
      `UPDATE users
       SET deleted_at = CURRENT_TIMESTAMP,
           is_active = FALSE,
           email = CONCAT('deleted_', id, '_', email),
           phone = CONCAT('deleted_', id, '_', phone),
           password_hash = 'DELETED_ACCOUNT',
           passport_photo_url = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    // Clear auth cookies
    const { clearAuthCookies } = require('../config/utils/authCookies');
    clearAuthCookies(res);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    req.logger.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    });
  }
});

// Verify current user's password for sensitive actions
router.post('/verify-password', authenticate, sensitiveActionLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Password is required',
      });
    }

    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const isValid = await bcrypt.compare(password, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password',
      });
    }

    return res.json({
      success: true,
      message: 'Password verified',
    });
  } catch (error) {
    req.logger.error('Password verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify password',
    });
  }
});

// Upload passport photo
router.post('/upload-passport', authenticate, uploadPassportLocal, validateFileMagicBytesMiddleware, async (req, res) => {
  let uploadPersisted = false;

  try {
    await ensureIdentitySchema();

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const userId = req.user.id;
    const captureSource = req.body?.capture_source;
    const liveCaptureToken = req.body?.live_capture_token;

    if (captureSource !== 'live_camera') {
      cleanupUploadedFile(req.file);
      return res.status(400).json({
        success: false,
        message: 'Live camera capture is required',
      });
    }

    if (REQUIRE_LIVE_CAPTURE_SESSION) {
      const isValidSession = consumeLiveCaptureSession(userId, liveCaptureToken);
      if (!isValidSession) {
        cleanupUploadedFile(req.file);
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired live capture session. Please retake photo.',
        });
      }
    }

    const relativePath = `/uploads/passports/${req.file.filename}`;

    // Check if identity is already verified via Prembly
    const currentUser = await db.query(
      `SELECT u.nin_verified, u.identity_document_type, u.nin,
              u.international_passport_number,
              (
                SELECT crr.status
                FROM credential_revalidation_requests crr
                WHERE crr.user_id = u.id
                  AND crr.status IN ('requested', 'provider_pending', 'submitted', 'rejected')
                ORDER BY crr.created_at DESC
                LIMIT 1
              ) AS active_revalidation_status
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    const hasVerifiedIdentity = currentUser.rows.length > 0 &&
      currentUser.rows[0].nin_verified === true;

    const currentIdentity = currentUser.rows[0] || {};
    const hasIdentityNumber =
      currentIdentity.identity_document_type === 'passport'
        ? Boolean(currentIdentity.international_passport_number)
        : Boolean(currentIdentity.nin);
    const activeRevalidationStatus = currentIdentity.active_revalidation_status || null;
    const hasActiveRevalidation = Boolean(activeRevalidationStatus);
    const preservedReviewStatus =
      activeRevalidationStatus === 'provider_pending'
        ? 'provider_pending'
        : activeRevalidationStatus === 'submitted'
          ? 'pending'
          : activeRevalidationStatus
            ? 'revalidation_required'
            : null;

    const autoVerified = hasVerifiedIdentity && hasIdentityNumber && !hasActiveRevalidation;

    await db.query(
      `UPDATE users
       SET passport_photo_url = $1,
           identity_verified = $2,
           identity_verified_by = NULL,
           identity_verified_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE NULL END,
            identity_verification_status = CASE
              WHEN $2 THEN 'verified'
              WHEN $4::text IS NOT NULL THEN $4
              WHEN $3 THEN 'pending'
              ELSE NULL
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $5`,
      [
        relativePath,
        autoVerified,              // $2: identity_verified (auto by system)
        hasIdentityNumber,         // $3: set pending if identity number exists
        preservedReviewStatus,    // $4: preserve active revalidation task
        userId                     // $5: WHERE clause
      ]
    );
    uploadPersisted = true;

    const userResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, nin,
              identity_document_type, international_passport_number, nationality, nin_verified,
              passport_photo_url, email_verified, phone_verified,
              identity_verified, identity_verification_status, subscription_active,
              subscription_expires_at, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    const userData = userResult.rows[0];
    // Decrypt NIN before returning to the user
    if (userData && userData.nin) {
      userData.nin = decryptNIN(userData.nin);
    }

    res.json({
      success: true,
      message: 'Passport uploaded successfully',
      url: relativePath,
      user: userData
    });

  } catch (error) {
    if (!uploadPersisted) {
      cleanupUploadedFile(req.file);
    }
    req.logger.error('Upload passport error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload passport'
    });
  }
});


// Authenticated passport photo serving (NOT via express.static)
router.get('/passport-photo/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(403).json({ success: false, message: 'Invalid filename' });
    }

    // Extract user ID from filename: passport_{userId}_timestamp.ext
    const match = filename.match(/^passport_(\d+)_/);
    if (!match) {
      return res.status(400).json({ success: false, message: 'Invalid filename format' });
    }

    const fileOwnerId = parseInt(match[1], 10);

    const hasAccess = await canViewPassportPhoto({
      requester: req.user,
      ownerId: fileOwnerId,
      filename,
    });

    if (!hasAccess) {
      return res.status(403).json({ success: false, message: 'You do not have permission to view this file' });
    }

    const filePath = path.join(uploadDir, filename);

    // Verify the resolved path is within the upload directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    res.sendFile(resolvedPath);
  } catch (error) {
    req.logger.error('Serve passport photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to serve file' });
  }
});

router._userSecurityForTest = {
  canViewPassportPhoto,
  requireLiveCaptureSession: REQUIRE_LIVE_CAPTURE_SESSION,
};

router._tourForTest = {
  TOUR_EVENTS,
  buildTourAnalyticsWhere,
  calculateTourRate,
  compareTourVersions,
  deriveTourStateTransition,
  getTourState,
  normalizeTourLocale,
  normalizeTourObject,
  normalizeTourRoute,
  recordTourEvent,
  serializeTourState,
  resetSchemaCheck: () => {
    tourSchemaPromise = null;
  },
};

module.exports = router;
