const crypto = require('crypto');
const db = require('../config/middleware/database');
const { createNotification } = require('../config/utils/notificationService');
const { encryptNIN, decryptNIN } = require('../config/utils/ninEncryption');
const {
  validateNIN,
  validateInternationalPassport,
  verifyNINWithPrembly,
  verifyInternationalPassportWithPrembly,
  isPremblyConfigured,
} = require('../config/utils/premblyValidator');
const { buildPremblyRequestKey } = require('../config/utils/premblyResponse');
const {
  attemptToResult,
  beginPremblyVerificationAttempt,
  processPremblyAttemptResult,
} = require('../services/premblyRecoveryService');
const {
  normalizeCredentialRevalidationFields: normalizeFields,
  maskCredentialValue: maskValue,
  isValidCredentialBirthDate: isValidBirthDate,
} = require('../config/utils/credentialRevalidation');
const ACTIVE_STATUSES = ['requested', 'provider_pending', 'submitted', 'rejected'];
const ALL_STATUSES = [...ACTIVE_STATUSES, 'approved', 'cancelled'];

const rollbackQuietly = async (client) => {
  if (!client) return;
  try {
    await client.query('ROLLBACK');
  } catch (error) {
    req.logger.warn('Credential revalidation rollback failed:', error.message);
  }
};

const serializeRequest = (row) => {
  if (!row) return null;
  const copy = { ...row };
  delete copy.pending_identity_value;
  delete copy.pending_identity_hash;
  return copy;
};

const findRequestForUpdate = async (client, requestId, userId = null) => {
  const params = [requestId];
  let userClause = '';
  if (userId) {
    params.push(userId);
    userClause = 'AND r.user_id = $2';
  }

  const result = await client.query(
    `SELECT r.*, u.full_name, u.email, u.user_type, u.passport_photo_url,
            u.nin, u.nin_verified, u.identity_verified,
            u.identity_document_type, u.international_passport_number, u.nationality
     FROM credential_revalidation_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.id = $1 ${userClause}
     FOR UPDATE`,
    params
  );
  return result.rows[0] || null;
};

exports.createRequest = async (req, res) => {
  const userId = Number(req.params.userId);
  const requestedFields = normalizeFields(req.body?.requested_fields);
  const reason = String(req.body?.reason || '').trim();
  const instructions = String(req.body?.instructions || '').trim() || null;
  const dueAt = req.body?.due_at || null;
  const parsedDueAt = dueAt ? new Date(dueAt) : null;

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: 'Valid user ID is required' });
  }
  if (!requestedFields.length) {
    return res.status(400).json({ success: false, message: 'Select at least one credential to revalidate' });
  }
  if (requestedFields.includes('nin') && requestedFields.includes('international_passport')) {
    return res.status(400).json({
      success: false,
      message: 'Request either NIN or international passport revalidation, not both',
    });
  }
  if (reason.length < 5 || reason.length > 2000) {
    return res.status(400).json({ success: false, message: 'Reason must be between 5 and 2000 characters' });
  }
  if (instructions && instructions.length > 3000) {
    return res.status(400).json({ success: false, message: 'Instructions must be 3000 characters or fewer' });
  }
  if (parsedDueAt && (Number.isNaN(parsedDueAt.getTime()) || parsedDueAt <= new Date())) {
    return res.status(400).json({ success: false, message: 'Due date must be in the future' });
  }

  try {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
    const userResult = await client.query(
      `SELECT id, full_name, email, user_type, nin, international_passport_number,
              nationality, passport_photo_url, identity_document_type,
              nin_verified, identity_verified
       FROM users
       WHERE id = $1 AND deleted_at IS NULL AND user_type IN ('tenant', 'landlord', 'agent')
       FOR UPDATE`,
      [userId]
    );
    if (!userResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Eligible user not found' });
    }

    const user = userResult.rows[0];
    const hasExistingIdentityNumber = Boolean(user.nin || user.international_passport_number);
    if (!hasExistingIdentityNumber &&
        !requestedFields.some((field) => ['nin', 'international_passport'].includes(field))) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This user has no identity number on record. Include NIN or international passport in the request',
      });
    }
    if (!user.passport_photo_url && !requestedFields.includes('live_photo')) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: 'This user has no live passport photo. Include a new live passport photo in the request',
      });
    }

    const existing = await client.query(
      `SELECT id FROM credential_revalidation_requests
       WHERE user_id = $1 AND status = ANY($2::text[]) LIMIT 1`,
      [userId, ACTIVE_STATUSES]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'This user already has an active credential revalidation request',
      });
    }

    const currentNin = user.nin ? decryptNIN(user.nin) : null;
    const baseline = {
      identity_type:
        user.identity_document_type ||
        (user.international_passport_number ? 'passport' : 'nin'),
      identity_value_masked: maskValue(user.international_passport_number || currentNin),
      passport_photo_url: user.passport_photo_url || null,
      nationality: user.nationality || null,
      identity_verified: user.identity_verified === true,
      nin_verified: user.nin_verified === true,
    };

    const result = await client.query(
      `INSERT INTO credential_revalidation_requests (
         user_id, requested_by, requested_fields, reason, instructions, due_at, baseline_snapshot
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        userId,
        req.user.id,
        JSON.stringify(requestedFields),
        reason,
        instructions,
        parsedDueAt,
        JSON.stringify(baseline),
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
      [userId]
    );
    await client.query('COMMIT');

    await createNotification(
      userId,
      'credential_revalidation_requested',
      'Credential revalidation required',
      `An administrator requested credential revalidation: ${reason}`,
      '/verification-status'
    );

    return res.status(201).json({
      success: true,
      data: serializeRequest({ ...result.rows[0], full_name: user.full_name, email: user.email }),
    });
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'idx_credential_revalidation_one_active') {
      return res.status(409).json({
        success: false,
        message: 'This user already has an active credential revalidation request',
      });
    }
    req.logger.error('Create credential revalidation request error:', error);
    return res.status(500).json({ success: false, message: 'Failed to create revalidation request' });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    if (status && !ALL_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid revalidation status' });
    }

    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = 'WHERE r.status = $1';
    }
    const result = await db.query(
      `SELECT r.*, u.full_name, u.email, u.user_type, u.passport_photo_url,
              requester.full_name AS requested_by_name,
              reviewer.full_name AS reviewed_by_name
       FROM credential_revalidation_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users requester ON requester.id = r.requested_by
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       ${where}
       ORDER BY
         CASE r.status WHEN 'submitted' THEN 0 WHEN 'requested' THEN 1 ELSE 2 END,
         r.created_at DESC
       LIMIT 200`,
      params
    );
    return res.json({ success: true, data: result.rows.map(serializeRequest) });
  } catch (error) {
    req.logger.error('List credential revalidation requests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load revalidation requests' });
  }
};

exports.getMyRequests = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, requested_fields, reason, instructions, status, due_at,
              baseline_snapshot, submitted_summary, submitted_at,
              verification_metadata, review_note, reviewed_at, created_at, updated_at
       FROM credential_revalidation_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    req.logger.error('Get user credential revalidation requests error:', error);
    return res.status(500).json({ success: false, message: 'Failed to load credential revalidation' });
  }
};

exports.submitRequest = async (req, res) => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId) || requestId < 1) {
    return res.status(400).json({ success: false, message: 'Valid revalidation request ID is required' });
  }

  let client;
  let request;
  let providerPlan = null;
  let startedAttempt = null;
  let submittedWithoutProvider = null;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    request = await findRequestForUpdate(client, requestId, req.user.id);
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Revalidation request not found' });
    }
    if (!['requested', 'rejected'].includes(request.status)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'This request cannot be submitted now' });
    }

    const fields = normalizeFields(request.requested_fields);
    const submittedSummary = {};
    let encryptedIdentity = null;
    let identityHash = null;
    let identityType = null;
    let nationality = null;
    let verificationMetadata = {};

    if (fields.includes('nin')) {
      const validation = validateNIN(String(req.body?.nin || '').trim());
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: validation.message });
      }

      const duplicate = await client.query(
        'SELECT id FROM users WHERE nin_hash = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1',
        [crypto.createHash('sha256').update(validation.value).digest('hex'), req.user.id]
      );
      if (duplicate.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This NIN is already used by another account' });
      }

      const dateOfBirth = String(req.body?.date_of_birth || '').trim();
      if (!isValidBirthDate(dateOfBirth)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'A valid past date of birth is required for NIN verification' });
      }
      const testNin = String(process.env.NIMC_TEST_NIN || '00000000000').trim();
      const allowTestBypass =
        process.env.ALLOW_TEST_NIN_BYPASS === 'true' ||
        (process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_NIN_BYPASS !== 'false');

      encryptedIdentity = encryptNIN(validation.value);
      if (!encryptedIdentity) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: 'NIN encryption is not configured' });
      }
      identityHash = crypto.createHash('sha256').update(validation.value).digest('hex');
      identityType = 'nin';
      submittedSummary.nin = maskValue(validation.value);

      if (validation.value === testNin && allowTestBypass) {
        verificationMetadata = {
          provider: 'test_bypass',
          status: 'verified',
          verified: true,
        };
      } else {
        if (!isPremblyConfigured()) {
          await client.query('ROLLBACK');
          return res.status(503).json({
            success: false,
            message: 'Prembly verification is required but is not configured on the server',
          });
        }
        const names = String(request.full_name || '').trim().split(/\s+/);
        providerPlan = {
          identityType: 'nin',
          verify: (callbackUrl) => verifyNINWithPrembly(
            validation.value,
            names[0] || '',
            names.slice(1).join(' ') || names[0] || '',
            dateOfBirth,
            { callbackUrl }
          ),
        };
      }
    }

    if (fields.includes('international_passport')) {
      const validation = validateInternationalPassport(req.body?.international_passport_number);
      if (!validation.valid) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: validation.message });
      }
      nationality = String(req.body?.nationality || '').trim();
      const dateOfBirth = String(req.body?.date_of_birth || '').trim();
      if (nationality.length < 2 || nationality.length > 80) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Nationality is required for passport revalidation' });
      }
      const duplicate = await client.query(
        `SELECT id FROM users
         WHERE UPPER(international_passport_number) = $1 AND id <> $2 AND deleted_at IS NULL LIMIT 1`,
        [validation.value, req.user.id]
      );
      if (duplicate.rows.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'This passport is already used by another account' });
      }
      if (!isValidBirthDate(dateOfBirth)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'A valid past date of birth is required for passport verification' });
      }
      encryptedIdentity = encryptNIN(validation.value);
      if (!encryptedIdentity) {
        await client.query('ROLLBACK');
        return res.status(500).json({ success: false, message: 'Credential encryption is not configured' });
      }
      identityHash = crypto.createHash('sha256').update(validation.value).digest('hex');
      identityType = 'passport';
      submittedSummary.international_passport = maskValue(validation.value);
      submittedSummary.nationality = nationality;
      if (!isPremblyConfigured()) {
        await client.query('ROLLBACK');
        return res.status(503).json({
          success: false,
          message: 'Prembly passport verification is required but is not configured on the server',
        });
      }
      providerPlan = {
        identityType: 'passport',
        verify: (callbackUrl) => verifyInternationalPassportWithPrembly(
          validation.value,
          request.full_name,
          nationality,
          dateOfBirth,
          { callbackUrl }
        ),
      };
    }

    if (fields.includes('live_photo')) {
      const baselinePhoto = request.baseline_snapshot?.passport_photo_url || null;
      if (!request.passport_photo_url || request.passport_photo_url === baselinePhoto) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Capture and upload a new live passport photo before submitting',
        });
      }
      submittedSummary.live_photo = 'new_capture_uploaded';
    }

    let requestStatus = 'submitted';
    if (providerPlan) {
      const requestKeyHash = buildPremblyRequestKey({
        contextType: 'credential_revalidation',
        contextId: requestId,
        identityType,
        subjectHash: identityHash,
      });
      startedAttempt = await beginPremblyVerificationAttempt({
        client,
        contextType: 'credential_revalidation',
        contextId: requestId,
        identityType,
        subjectHash: identityHash,
        requestKeyHash,
      });
      requestStatus = 'provider_pending';
      verificationMetadata = {
        provider: 'prembly',
        status: 'initiating',
        verified: false,
        attempt_id: startedAttempt.attempt.id,
      };
    }

    const result = await client.query(
      `UPDATE credential_revalidation_requests
       SET status = $2,
           submitted_summary = $3::jsonb,
           pending_identity_value = $4,
           pending_identity_hash = $5,
           pending_identity_type = $6,
           pending_nationality = $7,
           verification_metadata = $8::jsonb,
           submitted_at = CASE WHEN $2 = 'submitted' THEN NOW() ELSE NULL END,
           review_note = NULL,
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        requestId,
        requestStatus,
        JSON.stringify(submittedSummary),
        encryptedIdentity,
        identityHash,
        identityType,
        nationality,
        JSON.stringify(verificationMetadata),
      ]
    );
    await client.query(
      `UPDATE users
       SET identity_verified = FALSE,
           identity_verification_status = $2,
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [
        req.user.id,
        providerPlan ? 'provider_pending' : 'pending',
      ]
    );
    await client.query('COMMIT');
    submittedWithoutProvider = result.rows[0];
  } catch (error) {
    await rollbackQuietly(client);
    req.logger.error('Prepare credential revalidation submission error:', error);
    return res.status(500).json({ success: false, message: 'Failed to prepare credential revalidation' });
  } finally {
    client?.release();
  }

  if (!providerPlan) {
    if (request.requested_by) {
      await createNotification(
        request.requested_by,
        'credential_revalidation_submitted',
        'Credential revalidation submitted',
        `${request.full_name} submitted the requested credentials for review.`,
        '/super-admin?tab=verifications'
      );
    }
    return res.json({
      success: true,
      message: 'Credentials submitted for super-admin review',
      data: serializeRequest(submittedWithoutProvider),
    });
  }

  let verificationResult;
  if (!startedAttempt.isNew) {
    verificationResult = attemptToResult(startedAttempt.attempt);
  } else {
    try {
      verificationResult = await providerPlan.verify(startedAttempt.callbackUrl);
    } catch (error) {
      verificationResult = {
        verified: false,
        pending: true,
        status: 'service_error',
        message: `Prembly did not return a final response: ${error.message}`,
      };
    }
  }

  let updatedAttempt = startedAttempt.attempt;
  if (startedAttempt.isNew) {
    try {
      updatedAttempt = await processPremblyAttemptResult({
        attemptId: startedAttempt.attempt.id,
        result: verificationResult,
      });
    } catch (error) {
      req.logger.error('Save Prembly verification result error:', error);
      verificationResult = {
        ...verificationResult,
        verified: false,
        pending: true,
        status: 'provider_pending',
        message: 'Prembly received the check. RentalHub is waiting for its signed callback.',
      };
    }
  }

  const finalResult = updatedAttempt
    ? attemptToResult(updatedAttempt)
    : verificationResult;
  const refreshed = await db.query(
    'SELECT * FROM credential_revalidation_requests WHERE id = $1',
    [requestId]
  );
  const serialized = serializeRequest(refreshed.rows[0] || submittedWithoutProvider);

  if (finalResult.status === 'verified') {
    return res.json({
      success: true,
      message: 'Prembly verified the credential. It is now awaiting super-admin review.',
      data: serialized,
    });
  }
  if (finalResult.status === 'not_verified') {
    return res.status(422).json({
      success: false,
      code: 'PREMBLY_NOT_VERIFIED',
      message: finalResult.message || 'Prembly could not verify this credential',
      data: serialized,
    });
  }

  if (startedAttempt.isNew) {
    await createNotification(
      req.user.id,
      'credential_provider_pending',
      'Credential check is still processing',
      'Prembly is temporarily unavailable or still processing. RentalHub saved this check and will recover the result automatically without submitting another paid verification.',
      '/verification-status'
    );
  }
  return res.status(202).json({
    success: true,
    code: 'PREMBLY_VERIFICATION_PENDING',
    message: 'Prembly is temporarily unavailable or still processing. RentalHub will check the same transaction automatically; do not resubmit the credential.',
    data: serialized,
  });
};

exports.reviewRequest = async (req, res) => {
  const requestId = Number(req.params.requestId);
  const decision = String(req.body?.decision || '').trim();
  const reviewNote = String(req.body?.review_note || '').trim();

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'Decision must be approved or rejected' });
  }
  if (decision === 'rejected' && reviewNote.length < 5) {
    return res.status(400).json({ success: false, message: 'A clear rejection reason is required' });
  }
  if (reviewNote.length > 3000) {
    return res.status(400).json({ success: false, message: 'Review note must be 3000 characters or fewer' });
  }
  if (!Number.isInteger(requestId) || requestId < 1) {
    return res.status(400).json({ success: false, message: 'Valid revalidation request ID is required' });
  }

  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const request = await findRequestForUpdate(client, requestId);
    if (!request) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Revalidation request not found' });
    }
    if (request.status !== 'submitted') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Only submitted requests can be reviewed' });
    }

    if (decision === 'approved') {
      const fields = normalizeFields(request.requested_fields);
      const requestedIdentityType = fields.includes('nin')
        ? 'nin'
        : fields.includes('international_passport')
          ? 'passport'
          : null;
      if (requestedIdentityType && request.pending_identity_type !== requestedIdentityType) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'The required identity credential was not included in this submission',
        });
      }

      const hasCurrentIdentityNumber = Boolean(request.nin || request.international_passport_number);
      if (!request.pending_identity_type && !hasCurrentIdentityNumber) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'An approved NIN or international passport number is required before approval',
        });
      }

      const updates = [
        'identity_verified = TRUE',
        "identity_verification_status = 'verified'",
        'identity_verified_by = $2',
        'identity_verified_at = NOW()',
        'updated_at = NOW()',
      ];
      const values = [request.user_id, req.user.id];

      if (request.pending_identity_type) {
        const value = decryptNIN(request.pending_identity_value);
        if (!value) {
          await client.query('ROLLBACK');
          return res.status(500).json({ success: false, message: 'Submitted credential could not be decrypted' });
        }
        if (request.pending_identity_type === 'nin') {
          const validation = validateNIN(value);
          const expectedHash = crypto.createHash('sha256').update(value).digest('hex');
          if (!validation.valid || expectedHash !== request.pending_identity_hash) {
            await client.query('ROLLBACK');
            return res.status(500).json({
              success: false,
              message: 'Submitted NIN failed the secure storage integrity check',
            });
          }
          values.push(request.pending_identity_value, request.pending_identity_hash);
          updates.push(`nin = $${values.length - 1}`, `nin_hash = $${values.length}`);
          updates.push('nin_verified = TRUE', "identity_document_type = 'nin'");
          updates.push('international_passport_number = NULL', 'nationality = NULL');
        } else {
          const validation = validateInternationalPassport(value);
          if (!validation.valid) {
            await client.query('ROLLBACK');
            return res.status(500).json({
              success: false,
              message: 'Submitted passport failed the secure storage integrity check',
            });
          }
          values.push(value, request.pending_nationality);
          updates.push(`international_passport_number = $${values.length - 1}`);
          updates.push(`nationality = $${values.length}`, "identity_document_type = 'passport'");
          updates.push('nin = NULL', 'nin_hash = NULL', 'nin_verified = FALSE');
        }
      }

      if (!request.passport_photo_url) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, message: 'A live passport photo is required before approval' });
      }
      await client.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, values);
    } else {
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
    }

    const result = await client.query(
      `UPDATE credential_revalidation_requests
       SET status = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           review_note = $4,
           pending_identity_value = NULL,
           pending_identity_hash = NULL,
           pending_identity_type = NULL,
           pending_nationality = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [requestId, decision, req.user.id, reviewNote || null]
    );
    await client.query('COMMIT');

    await createNotification(
      request.user_id,
      `credential_revalidation_${decision}`,
      decision === 'approved' ? 'Credential revalidation approved' : 'Credential revalidation needs correction',
      decision === 'approved'
        ? 'Your submitted credentials were approved.'
        : `Your credential revalidation was returned: ${reviewNote}`,
      '/verification-status'
    );
    return res.json({ success: true, data: serializeRequest(result.rows[0]) });
  } catch (error) {
    await rollbackQuietly(client);
    req.logger.error('Review credential revalidation error:', error);
    return res.status(500).json({ success: false, message: 'Failed to review credential revalidation' });
  } finally {
    client?.release();
  }
};
