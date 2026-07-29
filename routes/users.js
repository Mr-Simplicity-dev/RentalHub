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
const { sensitiveActionLimiter } = require('../config/middleware/securityRateLimiters');
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
        user_tour_states: ['user_id', 'platform', 'tour_key', 'last_skipped_at'],
        user_tour_events: ['user_id', 'platform', 'tour_key', 'event_id'],
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

const TOUR_EVENTS = new Set(['welcome_shown', 'started', 'replayed', 'completed', 'skipped', 'dismissed']);
const TOUR_EVENT_STATUS = {
  welcome_shown: 'welcome_shown',
  started: 'in_progress',
  replayed: 'in_progress',
  completed: 'completed',
  skipped: 'skipped',
  dismissed: 'dismissed',
};

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

  return result.rows[0] || null;
};

const recordTourEvent = async (userId, payload = {}) => {
  await ensureTourSchema();

  const eventType = normalizeTourText(payload.event_type);
  if (!TOUR_EVENTS.has(eventType)) {
    throw tourInputError('Invalid tour event type');
  }

  const dashboardType = normalizeTourText(payload.dashboard_type, null, {
    field: 'Dashboard type',
    maxLength: 80,
    lowercase: true,
  });
  const rawMetadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? payload.metadata
    : {};
  const platform = normalizeTourPlatform(payload.platform ?? rawMetadata.platform, 'legacy');
  const tourKey = normalizeTourKey(payload.tour_key, dashboardType || 'default');
  const tourVersion = normalizeTourText(payload.tour_version, '3', {
    field: 'Tour version',
    maxLength: 40,
  });
  const eventId = normalizeTourText(payload.event_id, null, {
    field: 'Tour event ID',
    maxLength: 100,
    lowercase: true,
  });
  const stepId = normalizeTourText(payload.step_id, null, {
    field: 'Tour step ID',
    maxLength: 120,
  });
  const currentStep = normalizeTourInteger(payload.current_step, 'Current step');
  const totalSteps = normalizeTourInteger(payload.total_steps, 'Total steps');
  if (currentStep !== null && totalSteps !== null && currentStep > totalSteps) {
    throw tourInputError('Current step cannot be greater than total steps');
  }
  const metadata = {
    ...rawMetadata,
    platform,
  };
  const serializedMetadata = JSON.stringify(metadata);
  if (Buffer.byteLength(serializedMetadata, 'utf8') > 16384) {
    throw tourInputError('Tour metadata must be 16 KB or smaller');
  }

  const startedIncrement = eventType === 'started' ? 1 : 0;
  const completedIncrement = eventType === 'completed' ? 1 : 0;
  const skippedIncrement = eventType === 'skipped' ? 1 : 0;
  const dismissedIncrement = eventType === 'dismissed' ? 1 : 0;
  const replayIncrement = eventType === 'replayed' ? 1 : 0;
  const client = await db.connect();

  try {
    await client.query('BEGIN');

    const eventResult = await client.query(
      `INSERT INTO user_tour_events (
         user_id, platform, tour_key, event_id, event_type, dashboard_type,
         tour_version, step_id, current_step, total_steps, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       ON CONFLICT (user_id, platform, event_id)
         WHERE event_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
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
      ]
    );

    // A retried request with the same client event ID must not create another
    // analytics row or increment the aggregate counters a second time.
    if (eventId && eventResult.rowCount === 0) {
      const existingState = await client.query(
        `SELECT *
         FROM user_tour_states
         WHERE user_id = $1 AND platform = $2 AND tour_key = $3
         LIMIT 1`,
        [userId, platform, tourKey]
      );
      await client.query('COMMIT');
      return existingState.rows[0] || null;
    }

    const stateResult = await client.query(
      `INSERT INTO user_tour_states (
         user_id, platform, tour_key, dashboard_type, tour_version, status,
         last_welcome_shown_at, last_started_at, last_completed_at,
         last_dismissed_at, last_skipped_at,
         started_count, completed_count, skipped_count, dismissed_count, replay_count,
         updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         CASE WHEN $7 = 'welcome_shown' THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $7 IN ('started', 'replayed') THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $7 = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $7 = 'dismissed' THEN CURRENT_TIMESTAMP ELSE NULL END,
         CASE WHEN $7 = 'skipped' THEN CURRENT_TIMESTAMP ELSE NULL END,
         $8, $9, $10, $11, $12,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (user_id, platform, tour_key) DO UPDATE SET
         dashboard_type = COALESCE(EXCLUDED.dashboard_type, user_tour_states.dashboard_type),
         tour_version = CASE
           WHEN user_tour_states.tour_version ~ '^[0-9]+$'
            AND EXCLUDED.tour_version ~ '^[0-9]+$'
            AND user_tour_states.tour_version::numeric > EXCLUDED.tour_version::numeric
             THEN user_tour_states.tour_version
           ELSE EXCLUDED.tour_version
         END,
         status = CASE
           WHEN user_tour_states.tour_version ~ '^[0-9]+$'
            AND EXCLUDED.tour_version ~ '^[0-9]+$'
            AND user_tour_states.tour_version::numeric > EXCLUDED.tour_version::numeric
             THEN user_tour_states.status
           WHEN user_tour_states.tour_version = EXCLUDED.tour_version
            AND user_tour_states.status IN ('completed', 'skipped', 'dismissed')
            AND $7 IN ('welcome_shown', 'started')
             THEN user_tour_states.status
           ELSE EXCLUDED.status
         END,
         last_welcome_shown_at = COALESCE(EXCLUDED.last_welcome_shown_at, user_tour_states.last_welcome_shown_at),
         last_started_at = COALESCE(EXCLUDED.last_started_at, user_tour_states.last_started_at),
         last_completed_at = COALESCE(EXCLUDED.last_completed_at, user_tour_states.last_completed_at),
         last_dismissed_at = COALESCE(EXCLUDED.last_dismissed_at, user_tour_states.last_dismissed_at),
         last_skipped_at = COALESCE(EXCLUDED.last_skipped_at, user_tour_states.last_skipped_at),
         started_count = user_tour_states.started_count + $8,
         completed_count = user_tour_states.completed_count + $9,
         skipped_count = user_tour_states.skipped_count + $10,
         dismissed_count = user_tour_states.dismissed_count + $11,
         replay_count = user_tour_states.replay_count + $12,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        userId,
        platform,
        tourKey,
        dashboardType,
        tourVersion,
        TOUR_EVENT_STATUS[eventType],
        eventType,
        startedIncrement,
        completedIncrement,
        skippedIncrement,
        dismissedIncrement,
        replayIncrement,
      ]
    );

    await client.query('COMMIT');
    return stateResult.rows[0];
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

    return res.json({
      success: true,
      data: state || {
        user_id: req.user.id,
        platform,
        tour_key: tourKey || dashboardType || 'default',
        dashboard_type: dashboardType,
        status: 'not_started',
        tour_version: '3',
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

router.post('/tour/events', authenticate, async (req, res) => {
  try {
    const state = await recordTourEvent(req.user.id, req.body || {});

    return res.status(201).json({
      success: true,
      data: state,
    });
  } catch (error) {
    req.logger.error('Tour event record error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'Failed to record tour event',
    });
  }
});

router.get('/tour/analytics', authenticate, [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Days must be between 1 and 365'),
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
    const [summaryResult, dailyResult] = await Promise.all([
      db.query(
        `SELECT
           event_type,
           COUNT(*)::int AS event_count,
           COUNT(DISTINCT user_id)::int AS unique_users
         FROM user_tour_events
         WHERE created_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')
         GROUP BY event_type
         ORDER BY event_type`,
        [days]
      ),
      db.query(
        `SELECT
           DATE(created_at) AS event_date,
           event_type,
           COUNT(*)::int AS event_count
         FROM user_tour_events
         WHERE created_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')
         GROUP BY DATE(created_at), event_type
         ORDER BY event_date DESC, event_type`,
        [days]
      ),
    ]);

    return res.json({
      success: true,
      data: {
        days,
        summary: summaryResult.rows,
        daily: dailyResult.rows,
      },
    });
  } catch (error) {
    req.logger.error('Tour analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to load tour analytics',
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

module.exports = router;
