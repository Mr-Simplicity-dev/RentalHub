const crypto = require('crypto');
const db = require('../config/middleware/database');
const { createNotification } = require('../config/utils/notificationService');
const {
  getVerificationStatusWithPrembly,
  isPremblyConfigured,
} = require('../config/utils/premblyValidator');
const {
  buildPremblyRequestKey,
  getPremblyBackoffMinutes,
} = require('../config/utils/premblyResponse');

const ACTIVE_ATTEMPT_STATUSES = ['initiating', 'pending', 'attention_required'];

const rollbackQuietly = async (client) => {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    console.warn('Prembly recovery rollback failed:', error.message);
  }
};

const getPremblyPublicBaseUrl = () => {
  const configured = [
    process.env.PREMBLY_WEBHOOK_BASE_URL,
    process.env.API_PUBLIC_URL,
    process.env.BACKEND_URL,
    process.env.APP_PUBLIC_URL,
    process.env.PRODUCTION_FRONTEND_URL,
    process.env.FRONTEND_URL,
  ].find((value) => String(value || '').trim());

  if (!configured) return null;

  try {
    const url = new URL(String(configured).trim());
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch (_) {
    return null;
  }
};

const buildCallbackUrl = (callbackToken) => {
  const baseUrl = getPremblyPublicBaseUrl();
  return baseUrl
    ? `${baseUrl}/api/prembly/webhook/${encodeURIComponent(callbackToken)}`
    : null;
};

const attemptToResult = (attempt) => {
  if (!attempt) {
    return {
      verified: false,
      pending: false,
      status: 'service_error',
      message: 'Prembly verification attempt was not found',
    };
  }

  const status =
    attempt.status === 'verified'
      ? 'verified'
      : attempt.status === 'not_verified'
        ? 'not_verified'
        : 'provider_pending';

  return {
    verified: status === 'verified',
    pending: status === 'provider_pending',
    status,
    message:
      attempt.provider_message ||
      (status === 'verified'
        ? 'Credential verified by Prembly'
        : status === 'not_verified'
          ? 'Credential could not be verified by Prembly'
          : 'Prembly is still processing this credential'),
    reference_id: attempt.provider_reference || null,
    response_code: attempt.response_code || null,
    verification_status: attempt.verification_status || null,
    billing_status: attempt.billing_status,
    attempt_id: attempt.id,
  };
};

const beginAttemptWithClient = async (client, {
  contextType,
  contextId = null,
  identityType,
  subjectHash,
  requestKeyHash,
}) => {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [requestKeyHash]);
  await client.query(
    `UPDATE prembly_verification_attempts
     SET status = 'expired', updated_at = NOW()
     WHERE context_type = 'registration'
       AND request_key_hash = $1
       AND status IN ('verified', 'not_verified')
       AND expires_at <= NOW()`,
    [requestKeyHash]
  );

  const existing = await client.query(
    contextType === 'registration'
      ? `SELECT *
         FROM prembly_verification_attempts
         WHERE context_type = 'registration'
           AND request_key_hash = $1
           AND status <> 'expired'
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`
      : `SELECT *
         FROM prembly_verification_attempts
         WHERE context_type = 'credential_revalidation'
           AND context_id = $1
           AND status = ANY($2::text[])
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
    contextType === 'registration'
      ? [requestKeyHash]
      : [contextId, ACTIVE_ATTEMPT_STATUSES]
  );

  if (existing.rows.length) {
    return {
      attempt: existing.rows[0],
      isNew: false,
      callbackUrl: buildCallbackUrl(existing.rows[0].callback_token),
    };
  }

  const attemptId = crypto.randomUUID();
  const callbackToken = crypto.randomUUID();
  const inserted = await client.query(
    `INSERT INTO prembly_verification_attempts (
       id, callback_token, context_type, context_id, request_key_hash,
       subject_hash, identity_type
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      attemptId,
      callbackToken,
      contextType,
      contextId,
      requestKeyHash,
      subjectHash,
      identityType,
    ]
  );

  return {
    attempt: inserted.rows[0],
    isNew: true,
    callbackUrl: buildCallbackUrl(callbackToken),
  };
};

const beginPremblyVerificationAttempt = async (options) => {
  if (options.client) {
    return beginAttemptWithClient(options.client, options);
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await beginAttemptWithClient(client, options);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
};

const safeProviderMetadata = (attempt, result, source) => ({
  provider: 'prembly',
  status: result.status,
  reference: result.reference_id || attempt.provider_reference || null,
  response_code: result.response_code || null,
  verification_status: result.verification_status || null,
  billing_status:
    typeof result.billing_status === 'boolean' ? result.billing_status : null,
  recovery_source: source,
  last_checked_at: new Date().toISOString(),
});

const applyResultWithClient = async (client, attempt, result, source) => {
  const referenceId = result.reference_id || attempt.provider_reference || null;
  const nextStatus =
    result.status === 'verified'
      ? 'verified'
      : result.status === 'not_verified'
        ? 'not_verified'
        : result.status === 'wallet_error'
          ? 'attention_required'
          : 'pending';
  const isFinal = ['verified', 'not_verified'].includes(nextStatus);
  const nextCheckMinutes = referenceId
    ? getPremblyBackoffMinutes(Number(attempt.poll_attempts || 0) + 1)
    : null;
  const providerMessage = String(result.message || '').slice(0, 2000) || null;

  const updatedAttempt = await client.query(
    `UPDATE prembly_verification_attempts
     SET status = $2,
         provider_reference = COALESCE($3, provider_reference),
         response_code = COALESCE($4, response_code),
         verification_status = COALESCE($5, verification_status),
         billing_status = COALESCE($6, billing_status),
         provider_message = $7,
         next_check_at = CASE
           WHEN $8::boolean OR $9::integer IS NULL THEN NULL
           ELSE NOW() + ($9::text || ' minutes')::interval
         END,
         completed_at = CASE WHEN $8::boolean THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      attempt.id,
      nextStatus,
      referenceId,
      result.response_code || null,
      result.verification_status || null,
      typeof result.billing_status === 'boolean' ? result.billing_status : null,
      providerMessage,
      isFinal,
      nextCheckMinutes,
    ]
  );
  const updated = updatedAttempt.rows[0];
  const notifications = [];

  if (attempt.context_type === 'credential_revalidation') {
    const requestResult = await client.query(
      `SELECT r.id, r.user_id, r.requested_by, r.status, u.full_name
       FROM credential_revalidation_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1
       FOR UPDATE`,
      [attempt.context_id]
    );
    const request = requestResult.rows[0];

    if (request && request.status === 'provider_pending') {
      const metadata = safeProviderMetadata(updated, result, source);

      if (nextStatus === 'verified') {
        await client.query(
          `UPDATE credential_revalidation_requests
           SET status = 'submitted',
               verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || $2::jsonb,
               submitted_at = NOW(),
               review_note = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [request.id, JSON.stringify(metadata)]
        );
        await client.query(
          `UPDATE users
           SET identity_verified = FALSE,
               identity_verification_status = 'pending',
               identity_verified_by = NULL,
               identity_verified_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [request.user_id]
        );
        notifications.push({
          userId: request.user_id,
          type: 'credential_provider_verified',
          title: 'Credential check completed',
          message: 'Prembly verified your updated credential. It is now awaiting super-admin review.',
          link: '/verification-status',
        });
        if (request.requested_by) {
          notifications.push({
            userId: request.requested_by,
            type: 'credential_revalidation_submitted',
            title: 'Credential revalidation submitted',
            message: `${request.full_name} passed Prembly verification and is ready for review.`,
            link: '/super-admin?tab=verifications',
          });
        }
      } else if (nextStatus === 'not_verified') {
        await client.query(
          `UPDATE credential_revalidation_requests
           SET status = 'rejected',
               verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || $2::jsonb,
               review_note = $3,
               pending_identity_value = NULL,
               pending_identity_hash = NULL,
               pending_identity_type = NULL,
               pending_nationality = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [
            request.id,
            JSON.stringify(metadata),
            providerMessage || 'Prembly could not verify the submitted credential',
          ]
        );
        await client.query(
          `UPDATE users
           SET identity_verified = FALSE,
               identity_verification_status = 'revalidation_required',
               identity_verified_by = NULL,
               identity_verified_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [request.user_id]
        );
        notifications.push({
          userId: request.user_id,
          type: 'credential_provider_not_verified',
          title: 'Credential needs correction',
          message: providerMessage || 'Prembly could not verify the submitted credential. Please check it and submit again.',
          link: '/verification-status',
        });
      } else {
        await client.query(
          `UPDATE credential_revalidation_requests
           SET verification_metadata = COALESCE(verification_metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = NOW()
           WHERE id = $1`,
          [request.id, JSON.stringify(metadata)]
        );
        await client.query(
          `UPDATE users
           SET identity_verified = FALSE,
               identity_verification_status = 'provider_pending',
               identity_verified_by = NULL,
               identity_verified_at = NULL,
               updated_at = NOW()
           WHERE id = $1`,
          [request.user_id]
        );
      }
    }
  }

  return { attempt: updated, notifications };
};

const sendQueuedNotifications = async (notifications) => {
  for (const notification of notifications) {
    await createNotification(
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      notification.link
    );
  }
};

const processPremblyAttemptResult = async ({
  attemptId,
  result,
  source = 'initial_response',
}) => {
  const client = await db.connect();
  let notifications = [];
  try {
    await client.query('BEGIN');
    const attemptResult = await client.query(
      'SELECT * FROM prembly_verification_attempts WHERE id = $1 FOR UPDATE',
      [attemptId]
    );
    if (!attemptResult.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }

    const applied = await applyResultWithClient(
      client,
      attemptResult.rows[0],
      result,
      source
    );
    notifications = applied.notifications;
    await client.query('COMMIT');
    await sendQueuedNotifications(notifications);
    return applied.attempt;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
};

const processPremblyWebhook = async ({
  callbackToken,
  webhookToken,
  payloadHash,
  result,
}) => {
  const client = await db.connect();
  let notifications = [];
  try {
    await client.query('BEGIN');
    const attemptResult = await client.query(
      'SELECT * FROM prembly_verification_attempts WHERE callback_token = $1 FOR UPDATE',
      [callbackToken]
    );
    if (!attemptResult.rows.length) {
      await client.query('ROLLBACK');
      return { found: false, duplicate: false };
    }

    const attempt = attemptResult.rows[0];
    if (
      attempt.provider_reference &&
      result.reference_id &&
      attempt.provider_reference !== result.reference_id
    ) {
      await client.query('ROLLBACK');
      return { found: true, duplicate: false, referenceMismatch: true };
    }

    const event = await client.query(
      `INSERT INTO prembly_webhook_events (token, attempt_id, payload_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO NOTHING
       RETURNING token`,
      [String(webhookToken).slice(0, 255), attempt.id, payloadHash]
    );
    if (!event.rows.length) {
      await client.query('COMMIT');
      return { found: true, duplicate: true, attempt };
    }

    const applied = await applyResultWithClient(client, attempt, result, 'webhook');
    notifications = applied.notifications;
    await client.query('COMMIT');
    await sendQueuedNotifications(notifications);
    return { found: true, duplicate: false, attempt: applied.attempt };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
};

const executeRegistrationVerificationWithRecovery = async ({
  identityType,
  identityValue,
  email,
  phone,
  verify,
}) => {
  if (!isPremblyConfigured()) {
    return {
      verified: false,
      pending: false,
      status: 'not_configured',
      message: 'Prembly integration is not configured',
    };
  }

  const subjectHash = crypto
    .createHash('sha256')
    .update(String(identityValue).trim().toUpperCase())
    .digest('hex');
  const requestKeyHash = buildPremblyRequestKey({
    contextType: 'registration',
    identityType,
    subjectHash,
    email,
    phone,
  });
  const started = await beginPremblyVerificationAttempt({
    contextType: 'registration',
    identityType,
    subjectHash,
    requestKeyHash,
  });

  if (!started.isNew) {
    return attemptToResult(started.attempt);
  }

  const result = await verify(started.callbackUrl);
  const updated = await processPremblyAttemptResult({
    attemptId: started.attempt.id,
    result,
  });
  return attemptToResult(updated);
};

const getRegistrationAttemptStatus = async (attemptId) => {
  const result = await db.query(
    `SELECT id, status, provider_message, response_code, verification_status,
            billing_status, updated_at
     FROM prembly_verification_attempts
     WHERE id = $1 AND context_type = 'registration'
     LIMIT 1`,
    [attemptId]
  );
  return result.rows[0] ? attemptToResult(result.rows[0]) : null;
};

const claimDueAttempts = async (limit) => {
  const result = await db.query(
    `WITH due AS (
       SELECT id
       FROM prembly_verification_attempts
       WHERE status IN ('pending', 'attention_required')
         AND provider_reference IS NOT NULL
         AND next_check_at IS NOT NULL
         AND next_check_at <= NOW()
       ORDER BY next_check_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE prembly_verification_attempts a
     SET poll_attempts = a.poll_attempts + 1,
         last_checked_at = NOW(),
         next_check_at = NOW() + INTERVAL '10 minutes',
         updated_at = NOW()
     FROM due
     WHERE a.id = due.id
     RETURNING a.*`,
    [limit]
  );
  return result.rows;
};

const runPremblyRecoveryCycle = async ({ limit = 20 } = {}) => {
  const attempts = await claimDueAttempts(Math.max(Number(limit) || 20, 1));
  const summary = { claimed: attempts.length, verified: 0, not_verified: 0, pending: 0, failed: 0 };

  for (const attempt of attempts) {
    try {
      const result = await getVerificationStatusWithPrembly(attempt.provider_reference);
      const updated = await processPremblyAttemptResult({
        attemptId: attempt.id,
        result,
        source: 'status_poll',
      });
      if (updated?.status === 'verified') summary.verified += 1;
      else if (updated?.status === 'not_verified') summary.not_verified += 1;
      else summary.pending += 1;
    } catch (error) {
      summary.failed += 1;
      console.error(`Prembly recovery failed for attempt ${attempt.id}:`, error.message);
    }
  }

  return summary;
};

module.exports = {
  beginPremblyVerificationAttempt,
  executeRegistrationVerificationWithRecovery,
  getRegistrationAttemptStatus,
  processPremblyAttemptResult,
  processPremblyWebhook,
  runPremblyRecoveryCycle,
  attemptToResult,
};
