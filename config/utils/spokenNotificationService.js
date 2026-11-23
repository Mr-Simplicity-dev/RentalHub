const db = require('../middleware/database');
const logger = require('./logger');

const EVENT_TYPES = Object.freeze({
  RENT_SAVINGS_DUE_REMINDER: 'rent_savings_due_reminder',
  RENT_PAYMENT_SUCCESS: 'rent_payment_success',
});

const DEFAULT_EVENT_TTL_MS = 15 * 60 * 1000;
const CLAIM_TTL_MS = 90 * 1000;
const MAX_PENDING_EVENTS = 10;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60 * 1000;

const ensureSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS spoken_notification_events (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(80) NOT NULL,
      source_type VARCHAR(80),
      source_id BIGINT,
      dedup_key VARCHAR(255) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      language VARCHAR(16) NOT NULL DEFAULT 'en',
      audio_key VARCHAR(120),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      claimed_by_device VARCHAR(120),
      claim_expires_at TIMESTAMPTZ,
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by_device VARCHAR(120),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_attempt_at TIMESTAMPTZ,
      last_failure_reason VARCHAR(64),
      last_failure_at TIMESTAMPTZ,
      next_eligible_at TIMESTAMPTZ,
      playback_failed_at TIMESTAMPTZ,
      playback_failure_reason VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT spoken_notification_events_status_check CHECK (status IN ('pending', 'claimed', 'acknowledged', 'expired', 'cancelled', 'failed'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_spoken_notification_events_user_dedup
      ON spoken_notification_events(user_id, dedup_key);
    CREATE INDEX IF NOT EXISTS idx_spoken_notification_events_user_status_expires
      ON spoken_notification_events(user_id, status, expires_at DESC);
  `);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS last_failure_reason VARCHAR(64)`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS last_failure_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS next_eligible_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS playback_failed_at TIMESTAMPTZ`);
  await db.query(`ALTER TABLE spoken_notification_events ADD COLUMN IF NOT EXISTS playback_failure_reason VARCHAR(64)`);
};

const normalizeLanguage = (value) => {
  const normalized = String(value || 'en').trim().toLowerCase().split('-')[0];
  return ['en', 'ha', 'ig', 'yo'].includes(normalized) ? normalized : 'en';
};

const sanitizeText = (value, max = 255) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);

const emitSpokenEvent = async ({
  userId,
  eventType,
  sourceType = null,
  sourceId = null,
  dedupKey,
  title,
  message,
  language = 'en',
  audioKey = null,
  payload = {},
  expiresAt = null,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) => {
  if (!userId || !eventType || !dedupKey || !title || !message) return null;
  await ensureSchema();
  const safeExpiry = expiresAt instanceof Date ? expiresAt : new Date(Date.now() + DEFAULT_EVENT_TTL_MS);
  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const safeMaxAttempts = Math.max(1, Math.min(Number(maxAttempts) || DEFAULT_MAX_ATTEMPTS, 5));

  try {
    const result = await db.query(
      `INSERT INTO spoken_notification_events
        (user_id, event_type, source_type, source_id, dedup_key, title, message, language, audio_key, payload, status, expires_at, max_attempts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',$11,$12)
       ON CONFLICT (user_id, dedup_key) DO NOTHING
       RETURNING *`,
      [
        userId,
        sanitizeText(eventType, 80),
        sourceType ? sanitizeText(sourceType, 80) : null,
        sourceId ?? null,
        sanitizeText(dedupKey, 255),
        sanitizeText(title, 255),
        sanitizeText(message, 500),
        normalizeLanguage(language),
        audioKey ? sanitizeText(audioKey, 120) : null,
        JSON.stringify(safePayload),
        safeExpiry.toISOString(),
        safeMaxAttempts,
      ]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('spokenNotificationService.emitSpokenEvent error', { error: error.message, eventType, userId });
    return null;
  }
};

const expireOldEvents = async (userId) => {
  await db.query(
    `UPDATE spoken_notification_events
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
       AND status IN ('pending', 'claimed')
       AND expires_at <= CURRENT_TIMESTAMP`,
    [userId]
  );
};

const getPendingEvents = async (userId, { limit = MAX_PENDING_EVENTS } = {}) => {
  await ensureSchema();
  await expireOldEvents(userId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || MAX_PENDING_EVENTS, MAX_PENDING_EVENTS));
  const result = await db.query(
    `SELECT id, event_type, source_type, source_id, dedup_key, title, message, language, audio_key, payload, status,
            expires_at, claimed_at, claimed_by_device, claim_expires_at, acknowledged_at, created_at,
            attempt_count, max_attempts, last_failure_reason, next_eligible_at
     FROM spoken_notification_events
     WHERE user_id = $1
       AND status IN ('pending', 'claimed')
       AND expires_at > CURRENT_TIMESTAMP
       AND acknowledged_at IS NULL
       AND attempt_count < COALESCE(max_attempts, $3)
       AND (next_eligible_at IS NULL OR next_eligible_at <= CURRENT_TIMESTAMP)
       AND (claim_expires_at IS NULL OR claim_expires_at <= CURRENT_TIMESTAMP OR status = 'pending')
     ORDER BY created_at ASC
     LIMIT $2`,
    [userId, safeLimit, DEFAULT_MAX_ATTEMPTS]
  );
  return result.rows;
};

const claimEvent = async ({ userId, eventId, deviceId }) => {
  await ensureSchema();
  const safeDevice = sanitizeText(deviceId || 'unknown-device', 120);
  // Single atomic UPDATE: row lock prevents two devices claiming simultaneously.
  const result = await db.query(
    `UPDATE spoken_notification_events
     SET status = 'claimed',
         claimed_at = CURRENT_TIMESTAMP,
         claimed_by_device = $3,
         claim_expires_at = CURRENT_TIMESTAMP + INTERVAL '90 seconds',
         last_attempt_at = CURRENT_TIMESTAMP,
         attempt_count = attempt_count + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND user_id = $2
       AND acknowledged_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND status IN ('pending', 'claimed')
       AND attempt_count < COALESCE(max_attempts, $4)
       AND (next_eligible_at IS NULL OR next_eligible_at <= CURRENT_TIMESTAMP)
       AND (
         status = 'pending'
         OR (status = 'claimed' AND (claim_expires_at IS NULL OR claim_expires_at <= CURRENT_TIMESTAMP))
         OR (status = 'claimed' AND claimed_by_device = $3)
       )
     RETURNING *`,
    [eventId, userId, safeDevice, DEFAULT_MAX_ATTEMPTS]
  );
  return result.rows[0] || null;
};

const recordPlaybackResult = async ({ userId, eventId, deviceId, outcome, reason = null }) => {
  await ensureSchema();
  const safeDevice = sanitizeText(deviceId || 'unknown-device', 120);
  const normalizedOutcome = String(outcome || '').toLowerCase();
  const safeReason = reason ? sanitizeText(reason, 64) : null;

  if (normalizedOutcome === 'success') {
    const result = await db.query(
      `UPDATE spoken_notification_events
       SET status = 'acknowledged',
           acknowledged_at = CURRENT_TIMESTAMP,
           acknowledged_by_device = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND user_id = $2
         AND acknowledged_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       RETURNING *`,
      [eventId, userId, safeDevice]
    );
    return { event: result.rows[0] || null, acknowledged: !!result.rows[0] };
  }

  // Failure/interrupted/unavailable: do NOT acknowledge. Record failure and allow bounded retry.
  const permanent = normalizedOutcome === 'unavailable' || normalizedOutcome === 'unsupported';
  const result = await db.query(
    `UPDATE spoken_notification_events
     SET status = CASE
           WHEN expires_at <= CURRENT_TIMESTAMP THEN 'expired'
           WHEN $4::boolean = true THEN 'failed'
           WHEN attempt_count >= COALESCE(max_attempts, $5) THEN 'failed'
           ELSE 'pending'
         END,
         last_failure_reason = $6,
         last_failure_at = CURRENT_TIMESTAMP,
         playback_failed_at = CURRENT_TIMESTAMP,
         playback_failure_reason = $6,
         next_eligible_at = CASE
           WHEN $4::boolean = true THEN NULL
           WHEN attempt_count >= COALESCE(max_attempts, $5) THEN NULL
           WHEN expires_at <= CURRENT_TIMESTAMP THEN NULL
           ELSE CURRENT_TIMESTAMP + INTERVAL '60 seconds'
         END,
         claim_expires_at = NULL,
         claimed_by_device = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND user_id = $2
       AND acknowledged_at IS NULL
     RETURNING *`,
    [eventId, userId, safeDevice, permanent, DEFAULT_MAX_ATTEMPTS, safeReason || normalizedOutcome || 'failed']
  );
  return { event: result.rows[0] || null, acknowledged: false, permanent };
};

module.exports = {
  EVENT_TYPES,
  DEFAULT_EVENT_TTL_MS,
  CLAIM_TTL_MS,
  MAX_PENDING_EVENTS,
  DEFAULT_MAX_ATTEMPTS,
  RETRY_DELAY_MS,
  ensureSchema,
  normalizeLanguage,
  emitSpokenEvent,
  getPendingEvents,
  claimEvent,
  recordPlaybackResult,
  expireOldEvents,
};
