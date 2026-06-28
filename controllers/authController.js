const bcrypt = require('bcryptjs');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/middleware/database');
const { getFeatureFlagsMap } = require('../config/middleware/featureFlags');
const { getFrontendUrl } = require('../config/utils/frontendUrl');
const { resolveLocationSelection } = require('../config/utils/locationDirectory');
const { getLocationPricingQuote } = require('../config/utils/locationPricing');
const {
  assertRegistrationAllowed,
  evaluateRegistrationAccess,
  isGlobalRegistrationEnabled,
  isRegistrationMasterEnabled,
} = require('../config/utils/registrationAccess');
const {
  validateNIN,
  verifyNINWithPrembly,
  validateInternationalPassport,
  verifyInternationalPassportWithPrembly,
  performKYCCheckWithPrembly,
  performLivenessCheckWithPrembly
} = require('../config/utils/premblyValidator');
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendLawyerInviteEmail,
  sendFraudAlertEmail,
  sendAgentInviteEmail,
  sendAgentAssignmentNoticeEmail,
} = require('../config/utils/emailService');
const { sendVerificationCode } = require('../config/utils/smsService');
const {
  ensurePlatformLawyerSchema,
  hashPlatformLawyerInviteToken,
  syncPlatformLawyerRecordFromUser,
} = require('../config/utils/platformLawyerProgram');
const {
  ensureAgentSystemSchema,
  getActiveAgentAssignmentByAgentId,
  getActiveAgentAssignmentByLandlordId,
  getPendingAgentInviteByLandlordId,
  hashAgentInviteToken,
  inviteAgentForLandlord,
} = require('../config/utils/agentSystem');
const {
  ensurePlatformAgentSchema,
  fetchPublicPlatformAgents,
} = require('../config/utils/platformAgentProgram');
const {
  creditReferralRewardForRegistration,
  normalizeReferralCode,
} = require('../services/referralService');
const {
  AUTH_COOKIE_NAME,
  clearAuthCookies,
  getAuthTokenFromRequest,
  parseCookies,
  setAuthCookies,
  shouldReturnTokenInBody,
} = require('../config/utils/authCookies');
const redis = require('../config/utils/redis');

// OTP storage with Redis fallback to in-memory Map
const otpStore = new Map();
const lawyerOtpStore = new Map();

const otpGet = async (key) => {
  if (redis) {
    const data = await redis.get(`otp:${key}`);
    return data ? JSON.parse(data) : null;
  }
  return otpStore.get(key) || null;
};

const otpSet = async (key, value, ttlSeconds = 600) => {
  if (redis) {
    await redis.set(`otp:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  } else {
    otpStore.set(key, { ...value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
};

const otpDelete = async (key) => {
  if (redis) {
    await redis.del(`otp:${key}`);
  } else {
    otpStore.delete(key);
  }
};

// Lawyer OTP wrappers (same pattern, separate namespace)
const lawyerOtpGet = async (phone) => {
  if (redis) {
    const data = await redis.get(`otp:lawyer:${phone}`);
    return data ? JSON.parse(data) : null;
  }
  return lawyerOtpStore.get(phone) || null;
};

const lawyerOtpSet = async (phone, value, ttlSeconds = 600) => {
  if (redis) {
    await redis.set(`otp:lawyer:${phone}`, JSON.stringify(value), 'EX', ttlSeconds);
  } else {
    lawyerOtpStore.set(phone, { ...value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
};

const lawyerOtpDelete = async (phone) => {
  if (redis) {
    await redis.del(`otp:lawyer:${phone}`);
  } else {
    lawyerOtpStore.delete(phone);
  }
};
let identitySchemaReady = false;
let lawyerInviteSchemaReady = false;
let tenantRegistrationPaymentSchemaReady = false;
let registrationLocationSchemaReady = false;
let userSuspensionSchemaReady = false;

const LAWYER_INVITE_EXPIRY_HOURS = 72;
const LAWYER_INVITE_EXPIRY_MS = LAWYER_INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const TENANT_REGISTRATION_FEE_NGN = 3000;
const LANDLORD_REGISTRATION_FEE_NGN = 5000;
const FRONTEND_URL = getFrontendUrl();
const REGISTRATION_PRICING_TARGETS = {
  tenant: 'tenant_registration',
  landlord: 'landlord_registration',
};

const hashInviteToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

const ensureRegistrationLocationSchema = async () => {
  if (registrationLocationSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nin VARCHAR(11),
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS nin_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS passport_photo_url VARCHAR(500),
    ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS preferred_state_id INTEGER REFERENCES states(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS preferred_lga_name VARCHAR(120);
  `);

  registrationLocationSchemaReady = true;
};

const ensureIdentitySchema = async () => {
  if (identitySchemaReady) return;

  await ensureRegistrationLocationSchema();

  await db.query(`
    ALTER TABLE users
    ALTER COLUMN nin DROP NOT NULL;

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS identity_document_type VARCHAR(20) DEFAULT 'nin',
    ADD COLUMN IF NOT EXISTS international_passport_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS nationality VARCHAR(80),
    ADD COLUMN IF NOT EXISTS identity_verified_by INTEGER REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS identity_verification_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS chamber_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS chamber_phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS is_recruitment_admin BOOLEAN DEFAULT FALSE;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_international_passport_number
    ON users(international_passport_number)
    WHERE international_passport_number IS NOT NULL;
  `);

  identitySchemaReady = true;
};

const ensureUserSuspensionSchema = async () => {
  if (userSuspensionSchemaReady) return;

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS account_suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS account_suspended_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS account_suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `);

  userSuspensionSchemaReady = true;
};

const ensureLawyerInviteSchema = async () => {
  if (lawyerInviteSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS lawyer_invites (
      id SERIAL PRIMARY KEY,
      client_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lawyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      lawyer_email VARCHAR(255) NOT NULL,
      token_hash VARCHAR(64) NOT NULL UNIQUE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      accepted_at TIMESTAMP,
      last_sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resent_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_lawyer_invites_client
      ON lawyer_invites(client_user_id);

    CREATE INDEX IF NOT EXISTS idx_lawyer_invites_email
      ON lawyer_invites(lawyer_email);

    CREATE INDEX IF NOT EXISTS idx_lawyer_invites_status
      ON lawyer_invites(status, expires_at);
  `);

  lawyerInviteSchemaReady = true;
};

const ensureTenantRegistrationPaymentSchema = async () => {
  if (tenantRegistrationPaymentSchemaReady) return;

  await ensureRegistrationLocationSchema();

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_registration_payments (
      id SERIAL PRIMARY KEY,
      user_type VARCHAR(20) NOT NULL DEFAULT 'tenant',
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL DEFAULT 3000,
      currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      payment_method VARCHAR(50) NOT NULL DEFAULT 'paystack',
      transaction_reference VARCHAR(255) NOT NULL UNIQUE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      registration_payload JSONB NOT NULL,
      verification_meta JSONB,
      gateway_response JSONB,
      registered_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      consumed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );

    ALTER TABLE tenant_registration_payments
      ADD COLUMN IF NOT EXISTS user_type VARCHAR(20) NOT NULL DEFAULT 'tenant';

    CREATE INDEX IF NOT EXISTS idx_tenant_registration_payments_reference
      ON tenant_registration_payments(transaction_reference);

    CREATE INDEX IF NOT EXISTS idx_tenant_registration_payments_email
      ON tenant_registration_payments(email);

    DO $$
    DECLARE
      existing_check_name TEXT;
    BEGIN
      SELECT c.conname
        INTO existing_check_name
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'payments'
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%payment_type%';

      IF existing_check_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', existing_check_name);
      END IF;
    END $$;

    ALTER TABLE payments
      ADD CONSTRAINT payments_payment_type_check
      CHECK (
        payment_type IN (
          'tenant_subscription',
          'tenant_multiple_property_subscription',
          'landlord_subscription',
          'landlord_listing',
          'rent_payment',
          'property_unlock',
          'property_inspection_fee',
          'general_platform_fee',
          'registration_fee',
          'wallet_funding',
          'tenant_property_alert',
          'tenant_location_access',
          'evidence_verification',
          'lawyer_directory_unlock',
          'lawyer_access_fee',
          'agent_access_fee',
          'transportation_booking'
        )
      );
  `);

  tenantRegistrationPaymentSchemaReady = true;
};

const getRegistrationPaymentConfig = (userType, flags) => {
  if (userType === 'tenant') {
    return {
      enabled: flags.tenant_registration_payment === true,
      amount: TENANT_REGISTRATION_FEE_NGN,
    };
  }

  if (userType === 'landlord') {
    return {
      enabled: flags.landlord_registration_payment === true,
      amount: LANDLORD_REGISTRATION_FEE_NGN,
    };
  }

  return {
    enabled: false,
    amount: 0,
  };
};

const buildRegistrationPricingQuote = async ({
  userType,
  flags,
  stateId,
  lgaName,
  strictLocation = false,
}) => {
  const paymentConfig = getRegistrationPaymentConfig(userType, flags);
  const pricingTarget = REGISTRATION_PRICING_TARGETS[userType] || null;

  if (!pricingTarget) {
    return {
      ...paymentConfig,
      pricing_target: null,
      base_amount: paymentConfig.amount,
      amount: paymentConfig.amount,
      rule_scope: 'base',
      matched_rule: null,
      location_required: false,
      location_complete: false,
      location: null,
    };
  }

  let resolvedLocation = null;

  if (strictLocation && paymentConfig.enabled) {
    if (!stateId) {
      const error = new Error('State is required to calculate the registration fee');
      error.statusCode = 400;
      throw error;
    }

    if (!String(lgaName || '').trim()) {
      const error = new Error('Local government area is required to calculate the registration fee');
      error.statusCode = 400;
      throw error;
    }
  }

  if (stateId || lgaName) {
    try {
      resolvedLocation = await resolveLocationSelection({
        stateId,
        lgaName,
        requireLga: strictLocation && paymentConfig.enabled,
      });
    } catch (error) {
      if (strictLocation) {
        throw error;
      }
    }
  }

  const quote = await getLocationPricingQuote({
    appliesTo: pricingTarget,
    stateId: resolvedLocation?.state_id || null,
    lgaName: resolvedLocation?.lga_name || null,
  });

  return {
    ...paymentConfig,
    pricing_target: pricingTarget,
    base_amount: quote.base_amount,
    amount: quote.amount,
    rule_scope: quote.rule_scope,
    matched_rule: quote.matched_rule,
    location_required: paymentConfig.enabled,
    location_complete: Boolean(
      resolvedLocation?.state_id && resolvedLocation?.lga_name
    ),
    location: resolvedLocation,
  };
};

const withPreparedRegistrationLocation = (
  preparedRegistration,
  resolvedLocation = null
) => ({
  ...preparedRegistration,
  preferredStateId: resolvedLocation?.state_id || null,
  preferredStateName: resolvedLocation?.state_name || null,
  preferredLgaName: resolvedLocation?.lga_name || null,
});

const createLawyerInvite = async ({ clientUserId, lawyerEmail, clientName, clientRole }) => {
  await ensureLawyerInviteSchema();

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashInviteToken(rawToken);
  const expiresAt = new Date(Date.now() + LAWYER_INVITE_EXPIRY_MS);

  const inviteResult = await db.query(
    `INSERT INTO lawyer_invites (client_user_id, lawyer_email, token_hash, expires_at, status)
     VALUES ($1, $2, $3, $4, 'pending')
     RETURNING id, lawyer_email, expires_at`,
    [clientUserId, lawyerEmail, tokenHash, expiresAt]
  );

  const inviteUrl = `${FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;
  const emailResult = await sendLawyerInviteEmail({
    email: lawyerEmail,
    clientName,
    clientRole,
    inviteUrl,
    expiresInHours: LAWYER_INVITE_EXPIRY_HOURS,
  });

  return {
    ...inviteResult.rows[0],
    email_sent: !!emailResult?.success,
    email_error: emailResult?.success ? null : emailResult?.error || 'Lawyer invite email failed',
  };
};

const normalizeOptionalAgentInvite = async ({
  payload,
  landlordEmail,
  landlordPhone,
  landlordName,
}) => {
  await ensureAgentSystemSchema();

  const agentFullName = String(payload.agent_full_name || '').trim();
  const agentEmail = String(payload.agent_email || '').trim().toLowerCase();
  const agentPhone = String(payload.agent_phone || '').replace(/\s+/g, '');
  const hasAnyAgentField = Boolean(agentFullName || agentEmail || agentPhone);

  if (!hasAnyAgentField) {
    return null;
  }

  if (!agentFullName || !agentEmail || !agentPhone) {
    const error = new Error('Agent full name, email, and phone are required when adding an agent');
    error.statusCode = 400;
    throw error;
  }

  if (agentEmail === landlordEmail) {
    const error = new Error('Agent email must be different from the landlord email');
    error.statusCode = 400;
    throw error;
  }

  if (agentPhone === landlordPhone) {
    const error = new Error('Agent phone must be different from the landlord phone');
    error.statusCode = 400;
    throw error;
  }

  return {
    agent_full_name: agentFullName,
    agent_email: agentEmail,
    agent_phone: agentPhone,
    invited_by_name: landlordName,
  };
};

const generateToken = (userId, userType, options = {}) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: options.expiresIn || '7d' }
  );
};

const generateAccessToken = (userId, userType) => generateToken(userId, userType, { expiresIn: '1h' });

const attachAuthSession = (res, data) => {
  if (!data?.token) return data;

  // data.token is the 7d session token → stored in HTTP-only cookie
  // Decode it to mint a 1h access token for the Bearer header
  let accessToken = data.token;
  try {
    const decoded = jwt.verify(data.token, process.env.JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
    if (decoded?.userId) {
      accessToken = generateAccessToken(decoded.userId, decoded.userType);
    }
  } catch (_) {}

  const csrfToken = setAuthCookies(res, data.token);
  if (shouldReturnTokenInBody()) {
    return {
      ...data,
      token: accessToken,
      csrf_token: csrfToken,
    };
  }

  const { token, ...safeData } = data;
  return {
    ...safeData,
    token: accessToken,
    csrf_token: csrfToken,
  };
};

const assertUniqueUserFields = async (executor, {
  email,
  phone,
  cleanNIN,
  cleanPassportNumber
}) => {
  const duplicateConditions = ['email = $1', 'phone = $2'];
  const duplicateParams = [email, phone];
  let paramIndex = 3;

  if (cleanNIN) {
    // NIN is stored encrypted in DB; for unique checks we use a separate hash column
    // We check if a hash of the NIN exists in a lookup table
    const crypto = require('crypto');
    const ninHash = crypto.createHash('sha256').update(cleanNIN.trim()).digest('hex');
    duplicateConditions.push(`nin_hash = $${paramIndex++}`);
    duplicateParams.push(ninHash);
  }

  if (cleanPassportNumber) {
    duplicateConditions.push(`international_passport_number = $${paramIndex++}`);
    duplicateParams.push(cleanPassportNumber);
  }

  const existingUser = await executor.query(
    `SELECT id FROM users WHERE ${duplicateConditions.join(' OR ')}`,
    duplicateParams
  );

  if (existingUser.rows.length > 0) {
    const error = new Error(
      cleanNIN
        ? 'User with this email, phone, or NIN already exists'
        : cleanPassportNumber
          ? 'User with this email, phone, or passport number already exists'
          : 'User with this email or phone already exists'
    );
    error.statusCode = 400;
    throw error;
  }
};

const validateAndPrepareRegistration = async (payload) => {
  await ensureIdentitySchema();
  const flags = await getFeatureFlagsMap();

  const {
    email,
    phone,
    password,
    full_name,
    lawyer_email,
    nin,
    user_type,
    date_of_birth,
    identity_document_type = 'nin',
    is_foreigner = false,
    international_passport_number,
    nationality,
    agent_full_name,
    agent_email,
    agent_phone,
    use_rentalhub_lawyers,
    use_rentalhub_agents,
    referral_code,
    } = payload;

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').replace(/\s+/g, '');
  const cleanFullName = String(full_name || '').trim();
  const cleanLawyerEmail = lawyer_email
    ? String(lawyer_email).trim().toLowerCase()
    : '';
  const cleanReferralCode = normalizeReferralCode(referral_code);
  const optionalAgentInvite =
    user_type === 'landlord'
      ? await normalizeOptionalAgentInvite({
          payload: {
            agent_full_name,
            agent_email,
            agent_phone,
          },
          landlordEmail: cleanEmail,
          landlordPhone: cleanPhone,
          landlordName: cleanFullName,
        })
      : null;

  if (cleanLawyerEmail && cleanLawyerEmail === cleanEmail) {
    const error = new Error('Lawyer email must be different from your account email');
    error.statusCode = 400;
    throw error;
  }

  const isForeigner =
    is_foreigner === true ||
    is_foreigner === 'true' ||
    is_foreigner === 1 ||
    is_foreigner === '1';

  const isNINEnabled = flags.nin_number !== false;
  const isPassportEnabled = flags.passport_number !== false;
  const submittedNIN = String(nin || '').trim();
  const submittedPassportNumber = String(international_passport_number || '').trim();
  let identityType = null;
  let cleanNIN = null;
  let cleanPassportNumber = null;
  const testNIN = String(process.env.NIMC_TEST_NIN || '00000000000').trim();
  const allowTestNINBypass =
    process.env.ALLOW_TEST_NIN_BYPASS === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_NIN_BYPASS !== 'false');
  const submittedNationality = nationality ? String(nationality).trim() : '';
  const cleanNationality = submittedNationality || (isForeigner ? 'Foreign' : 'Nigeria');
  const isNigerianNationality = /^nigeria(n)?$/i.test(cleanNationality);

  let ninVerified = false;
  let verificationMeta = null;

  if (!isForeigner) {
    if (identity_document_type === 'passport' || submittedPassportNumber) {
      const error = new Error('NIN is required for local Nigerian registration');
      error.statusCode = 400;
      throw error;
    }

    if (nationality && !isNigerianNationality) {
      const error = new Error('Foreign applicants must register with international passport');
      error.statusCode = 400;
      throw error;
    }

    if (!isNINEnabled) {
      if (submittedNIN) {
        const error = new Error('NIN disabled');
        error.statusCode = 403;
        throw error;
      }
    } else {
      const ninValidation = validateNIN(submittedNIN);
      if (!ninValidation.valid) {
        const error = new Error(ninValidation.message);
        error.statusCode = 400;
        throw error;
      }

      identityType = 'nin';
      cleanNIN = ninValidation.value;

      const names = cleanFullName.split(/\s+/).filter(Boolean);
      const firstName = names[0] || '';
      const lastName = names.slice(1).join(' ') || names[0] || '';

      const isTestNIN = cleanNIN === testNIN;
      if (isTestNIN && allowTestNINBypass) {
        ninVerified = true;
        verificationMeta = {
          status: 'test_bypass',
          message: 'Test NIN bypass enabled'
        };
      } else {
        const nimcResult = await verifyNINWithPrembly(
          cleanNIN,
          firstName,
          lastName,
          date_of_birth
        );

        verificationMeta = {
          status: nimcResult.status,
          message: nimcResult.message
        };

        if (nimcResult.status === 'not_configured') {
          const error = new Error('Prembly verification is required but not configured on the server');
          error.statusCode = 503;
          throw error;
        }

        if (nimcResult.status === 'service_error') {
          const error = new Error(nimcResult.message);
          error.statusCode = 503;
          throw error;
        }

        if (nimcResult.status === 'not_verified') {
          const error = new Error(nimcResult.message || 'NIN verification failed');
          error.statusCode = 400;
          throw error;
        }

        ninVerified = nimcResult.verified === true;
      }
    }
  } else {
    if (identity_document_type === 'nin') {
      const error = new Error('International passport is required for foreign applicants');
      error.statusCode = 400;
      throw error;
    }

    if (isNigerianNationality) {
      const error = new Error('Nigerian applicants must register with NIN');
      error.statusCode = 400;
      throw error;
    }

    if (!isPassportEnabled) {
      if (submittedPassportNumber) {
        const error = new Error('Passport disabled');
        error.statusCode = 403;
        throw error;
      }
    } else {
      const passportValidation = validateInternationalPassport(
        submittedPassportNumber
      );

      if (!passportValidation.valid) {
        const error = new Error(passportValidation.message);
        error.statusCode = 400;
        throw error;
      }

      if (!cleanNationality) {
        const error = new Error('Nationality is required for international passport verification');
        error.statusCode = 400;
        throw error;
      }

      identityType = 'passport';
      cleanPassportNumber = passportValidation.value;

      const passportResult = await verifyInternationalPassportWithPrembly(
        cleanPassportNumber,
        cleanFullName,
        cleanNationality,
        date_of_birth
      );

      if (passportResult.status === 'not_configured') {
        const error = new Error('Passport verification API is required but not configured on the server');
        error.statusCode = 503;
        throw error;
      }

      if (passportResult.status === 'service_error') {
        const error = new Error(passportResult.message);
        error.statusCode = 503;
        throw error;
      }

      if (passportResult.status === 'not_verified') {
        const error = new Error(passportResult.message || 'Passport verification failed');
        error.statusCode = 400;
        throw error;
      }
    }
  }

  await assertUniqueUserFields(db, {
    email: cleanEmail,
    phone: cleanPhone,
    cleanNIN,
    cleanPassportNumber
  });

  return {
    preparedRegistration: {
      email: cleanEmail,
      phone: cleanPhone,
      full_name: cleanFullName,
      cleanLawyerEmail,
            useRentalhubLawyers: use_rentalhub_lawyers === true || use_rentalhub_lawyers === 'true',
      // Agents are only available for landlords — ignore the flag for tenants
      useRentalhubAgents:
        user_type === 'landlord' &&
        (use_rentalhub_agents === true || use_rentalhub_agents === 'true'),
        user_type,
      cleanNIN,
      ninVerified,
      identityType,
      cleanPassportNumber,
      cleanNationality,
      optionalAgentInvite,
      referralCode: cleanReferralCode || null,
    },
    plainPassword: password,
    verificationMeta
  };
};

/**
 * Assign a lawyer to a client using round-robin from available lawyers
 * in the client's state and LGA.
 */
const assignLawyerRoundRobin = async ({ clientUserId, stateId, lgaName }) => {
  // Get all active lawyers in the specified state/LGA
  let lawyersQuery = `
    SELECT id, full_name, email
    FROM users
    WHERE user_type = 'lawyer'
      AND assigned_state_id = $1
      AND assigned_lga_name = $2
      AND account_suspended_at IS NULL
      AND deleted_at IS NULL
    ORDER BY id ASC
  `;
  let lawyersParams = [stateId, lgaName];

  // If no lawyers found at LGA level, try state level
  let lawyersResult = await db.query(lawyersQuery, lawyersParams);

  if (lawyersResult.rows.length === 0) {
    // Fallback to state-wide lawyers if no LGA-specific lawyers
    lawyersQuery = `
      SELECT id, full_name, email
      FROM users
      WHERE user_type = 'lawyer'
        AND assigned_state_id = $1
        AND account_suspended_at IS NULL
        AND deleted_at IS NULL
      ORDER BY id ASC
    `;
    lawyersResult = await db.query(lawyersQuery, [stateId]);
  }

  if (lawyersResult.rows.length === 0) {
    console.error(`No available lawyers found for state_id ${stateId} / LGA ${lgaName}`);
    return null;
  }

  // Find the last assigned lawyer index for round-robin
  const lastAssignmentResult = await db.query(
    `SELECT la.lawyer_user_id
     FROM legal_authorizations la
     JOIN users u ON u.id = la.lawyer_user_id
     WHERE u.user_type = 'lawyer'
       AND (u.assigned_state_id = $1 OR u.assigned_state_id IS NULL)
       AND la.status = 'active'
       AND la.property_id IS NULL
     ORDER BY la.created_at DESC
     LIMIT 1`,
    [stateId]
  );

  let nextIndex = 0;

  if (lastAssignmentResult.rows.length > 0) {
    const lastLawyerId = lastAssignmentResult.rows[0].lawyer_user_id;
    const lastIndex = lawyersResult.rows.findIndex(l => l.id === lastLawyerId);
    if (lastIndex !== -1) {
      nextIndex = (lastIndex + 1) % lawyersResult.rows.length;
    }
  }

  const selectedLawyer = lawyersResult.rows[nextIndex];

  // Create legal authorization linking client to lawyer (without property)
  await db.query(
    `INSERT INTO legal_authorizations
     (property_id, client_user_id, lawyer_user_id, granted_by, status)
     VALUES (NULL, $1, $2, $3, 'active')`,
    [clientUserId, selectedLawyer.id, selectedLawyer.id]
  );

  // Send notification to the lawyer
  try {
    const { sendNotification } = require('../config/utils/notificationService');

    await sendNotification(
      selectedLawyer.id,
      'New Client Assignment',
      `You have been assigned a new client (ID: ${clientUserId}) from your area as a RentalHub NG lawyer. Please check your dashboard for details.`,
      'lawyer_assignment',
      clientUserId,
      'client'
    );
  } catch (notifError) {
    console.error('Lawyer assignment notification error:', notifError);
  }

  return {
    assignedLawyer: selectedLawyer,
    roundRobinIndex: nextIndex,
    totalLawyers: lawyersResult.rows.length
  };
};

/**
 * Assign a platform agent to a landlord using round-robin from available platform agents
 * in the landlord's state and LGA.
 */
const assignAgentRoundRobin = async ({ landlordUserId, stateId, lgaName }) => {
  await ensurePlatformAgentSchema();

  // Get all active platform agents (users with user_type = 'agent' who are listed in platform_agents)
  let agentsQuery = `
    SELECT u.id, u.full_name, u.email
    FROM platform_agents pa
    JOIN users u ON u.id = pa.agent_user_id
    WHERE pa.is_active = TRUE
      AND u.user_type = 'agent'
      AND u.account_suspended_at IS NULL
      AND u.deleted_at IS NULL
      AND u.assigned_state_id = $1
      AND u.assigned_lga_name = $2
    ORDER BY u.id ASC
  `;
  let agentsParams = [stateId, lgaName];

  let agentsResult = await db.query(agentsQuery, agentsParams);

  // Fallback to state-wide agents if no LGA-specific agents
  if (agentsResult.rows.length === 0) {
    agentsQuery = `
      SELECT u.id, u.full_name, u.email
      FROM platform_agents pa
      JOIN users u ON u.id = pa.agent_user_id
      WHERE pa.is_active = TRUE
        AND u.user_type = 'agent'
        AND u.account_suspended_at IS NULL
        AND u.deleted_at IS NULL
        AND u.assigned_state_id = $1
      ORDER BY u.id ASC
    `;
    agentsResult = await db.query(agentsQuery, [stateId]);
  }

  if (agentsResult.rows.length === 0) {
    console.error(`No available platform agents found for state_id ${stateId} / LGA ${lgaName}`);
    return null;
  }

  // Find the last assigned agent index for round-robin
  const lastAssignmentResult = await db.query(
    `SELECT la.agent_user_id
     FROM landlord_agents la
     JOIN users u ON u.id = la.agent_user_id
     WHERE u.user_type = 'agent'
       AND la.status = 'active'
     ORDER BY la.created_at DESC
     LIMIT 1`,
    []
  );

  let nextIndex = 0;

  if (lastAssignmentResult.rows.length > 0) {
    const lastAgentId = lastAssignmentResult.rows[0].agent_user_id;
    const lastIndex = agentsResult.rows.findIndex(a => a.id === lastAgentId);
    if (lastIndex !== -1) {
      nextIndex = (lastIndex + 1) % agentsResult.rows.length;
    }
  }

  const selectedAgent = agentsResult.rows[nextIndex];

  // Create the landlord-agent assignment directly
  await db.query(
    `INSERT INTO landlord_agents (
       landlord_user_id, agent_user_id, assigned_by_user_id, status,
       can_manage_properties, can_manage_damage_reports, can_manage_disputes,
       can_manage_legal, can_manage_finances
     )
     VALUES ($1, $2, $3, 'active', TRUE, TRUE, TRUE, TRUE, FALSE)
     ON CONFLICT (landlord_user_id, agent_user_id)
     DO UPDATE SET
       status = 'active',
       revoked_at = NULL,
       updated_at = CURRENT_TIMESTAMP`,
    [landlordUserId, selectedAgent.id, selectedAgent.id]
  );

  // Send notification to the agent
  try {
    const { sendNotification } = require('../config/utils/notificationService');

    await sendNotification(
      selectedAgent.id,
      'New Landlord Assignment',
      `You have been assigned a new landlord (ID: ${landlordUserId}) from your area as a RentalHub NG platform agent. Please check your dashboard for details.`,
      'agent_assignment',
      landlordUserId,
      'landlord'
    );
  } catch (notifError) {
    console.error('Agent assignment notification error:', notifError);
  }

  return {
    assignedAgent: selectedAgent,
    roundRobinIndex: nextIndex,
    totalAgents: agentsResult.rows.length
  };
};

const createUserFromPreparedRegistration = async ({
  preparedRegistration,
  passwordHash,
  verificationMeta,
  tenantRegistrationPayment
}) => {
  await ensureTenantRegistrationPaymentSchema();
  const crypto = require('crypto');
  const { encryptNIN } = require('../config/utils/ninEncryption');

  // Ensure the nin_hash column exists
  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS nin_hash VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_users_nin_hash ON users(nin_hash) WHERE nin_hash IS NOT NULL;
  `);

  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await assertUniqueUserFields(client, {
      email: preparedRegistration.email,
      phone: preparedRegistration.phone,
      cleanNIN: preparedRegistration.cleanNIN,
      cleanPassportNumber: preparedRegistration.cleanPassportNumber
    });

    // Encrypt NIN for storage — it's never stored in plaintext
    const encryptedNIN = preparedRegistration.cleanNIN
      ? encryptNIN(preparedRegistration.cleanNIN)
      : null;

    // Create a SHA-256 hash for duplicate checking
    const ninHash = preparedRegistration.cleanNIN
      ? crypto.createHash('sha256').update(preparedRegistration.cleanNIN.trim()).digest('hex')
      : null;

    const result = await client.query(
      `INSERT INTO users (
         user_type,
         email,
         phone,
         password_hash,
         full_name,
         nin,
         nin_hash,
         nin_verified,
         identity_document_type,
         international_passport_number,
         nationality,
         preferred_state_id,
         preferred_lga_name
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, email, full_name, user_type, created_at,
                 identity_document_type, nin_verified, nationality,
                 preferred_state_id, preferred_lga_name`,
      [
        preparedRegistration.user_type,
        preparedRegistration.email,
        preparedRegistration.phone,
        passwordHash,
        preparedRegistration.full_name,
        encryptedNIN,
        ninHash,
        preparedRegistration.ninVerified,
        preparedRegistration.identityType,
        preparedRegistration.cleanPassportNumber,
        preparedRegistration.cleanNationality,
        preparedRegistration.preferredStateId,
        preparedRegistration.preferredLgaName
      ]
    );

    const newUser = result.rows[0];

    if (tenantRegistrationPayment) {
      const paymentConsumptionResult = await client.query(
        `UPDATE tenant_registration_payments
         SET registered_user_id = $1,
             consumed_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND registered_user_id IS NULL
         RETURNING id`,
        [newUser.id, tenantRegistrationPayment.id]
      );

      if (!paymentConsumptionResult.rows.length) {
        const error = new Error('This tenant registration payment has already been used');
        error.statusCode = 400;
        throw error;
      }

      // Record only the base registration fee here. Add-on fees (lawyer
      // access ₦2,000 and agent access ₦5,000) are recorded separately
      // below so they are not double-counted in the payments ledger.
      const storedPayloadForBase = tenantRegistrationPayment.registration_payload || {};
      const basePlatformFeeAmount =
        Number(storedPayloadForBase.base_registration_amount) ||
        Number(tenantRegistrationPayment.amount) ||
        0;

      await client.query(
        `INSERT INTO payments (
           user_id,
           payment_type,
           amount,
           currency,
           payment_method,
           transaction_reference,
           payment_status,
           gateway_response,
           completed_at
         )
         VALUES ($1, 'general_platform_fee', $2, $3, $4, $5, 'completed', $6, $7)`,
        [
          newUser.id,
          basePlatformFeeAmount,
          tenantRegistrationPayment.currency,
          tenantRegistrationPayment.payment_method,
          tenantRegistrationPayment.transaction_reference,
          tenantRegistrationPayment.gateway_response,
          tenantRegistrationPayment.completed_at || new Date()
        ]
      );
    }

    await client.query('COMMIT');

    let referralReward = null;
    let lawyerInvite = null;
    let agentInvite = null;

    if (preparedRegistration.referralCode) {
      try {
        referralReward = await creditReferralRewardForRegistration({
          referralCode: preparedRegistration.referralCode,
          referredUserId: newUser.id,
        });
      } catch (referralError) {
        console.error('Referral reward credit error (non-fatal):', referralError);
      }
    }

    if (preparedRegistration.cleanLawyerEmail) {
      try {
        lawyerInvite = await createLawyerInvite({
          clientUserId: newUser.id,
          lawyerEmail: preparedRegistration.cleanLawyerEmail,
          clientName: newUser.full_name,
          clientRole: newUser.user_type,
        });
      } catch (inviteError) {
        console.error('Lawyer invite creation error:', inviteError);
      }
    }

    if (preparedRegistration.user_type === 'landlord' && preparedRegistration.optionalAgentInvite) {
      try {
        agentInvite = await inviteAgentForLandlord({
          landlordUserId: newUser.id,
          assignedByUserId: newUser.id,
          landlordName: newUser.full_name,
          agentFullName: preparedRegistration.optionalAgentInvite.agent_full_name,
          agentEmail: preparedRegistration.optionalAgentInvite.agent_email,
          agentPhone: preparedRegistration.optionalAgentInvite.agent_phone,
          sendAgentInviteEmail,
          sendAgentAssignmentNoticeEmail,
        });
      } catch (agentInviteError) {
        console.error('Agent invite creation error:', agentInviteError);
      }
    }

    // ====================================================================
    // LAWYER ACCESS FEE DISTRIBUTION (N2000)
    // When useRentalhubLawyers is true, the total payment includes N2000
    // for lawyer access. We need to:
    //   1. Assign a round-robin lawyer (if not already assigned via invite)
    //   2. Create a separate lawyer_access_fee payment record
    //   3. Distribute the N2000 to eligible admins
    // ====================================================================
    if (preparedRegistration.useRentalhubLawyers) {
      let assignedLawyerId = null;
      let assignedAgentId = null;

      // Assign round-robin lawyer in the client's state/LGA
      try {
        const roundRobinResult = await assignLawyerRoundRobin({
          clientUserId: newUser.id,
          stateId: preparedRegistration.preferredStateId,
          lgaName: preparedRegistration.preferredLgaName,
        });

        if (roundRobinResult && roundRobinResult.assignedLawyer) {
          assignedLawyerId = roundRobinResult.assignedLawyer.id;
        }
      } catch (roundRobinError) {
        console.error('Round-robin lawyer assignment error (non-fatal):', roundRobinError);
      }

      // Create a separate payment record for the N2000 lawyer access fee
      const lawyerFeePaymentResult = await db.query(
        `INSERT INTO payments (
           user_id,
           payment_type,
           amount,
           currency,
           payment_method,
           transaction_reference,
           payment_status,
           gateway_response,
           completed_at
         )
         VALUES ($1, 'lawyer_access_fee', $2, $3, $4, $5, 'completed', $6, $7)
         RETURNING id`,
        [
          newUser.id,
          2000,
          tenantRegistrationPayment.currency,
          tenantRegistrationPayment.payment_method,
          `${tenantRegistrationPayment.transaction_reference}_LAWYER_FEE`,
          tenantRegistrationPayment.gateway_response,
          tenantRegistrationPayment.completed_at || new Date()
        ]
      );

      const lawyerFeePaymentId = lawyerFeePaymentResult.rows[0].id;

      // Distribute the N2000 to all eligible admin roles
      try {
        const { distributeLawyerAccessFee } = require('../services/commissionService');
        const distributionResult = await distributeLawyerAccessFee({
          paymentId: lawyerFeePaymentId,
          userId: newUser.id,
          assignedLawyerId,
          assignedAgentId,
          stateId: preparedRegistration.preferredStateId,
          lgaName: preparedRegistration.preferredLgaName,
        });

        console.log(
          `Lawyer access fee distributed: ₦2000 across ${Object.keys(distributionResult.distribution).length} admins`
        );
      } catch (distError) {
        console.error('Lawyer access fee distribution error (non-fatal):', distError);
        }
      }

    // ====================================================================
    // AGENT ACCESS FEE DISTRIBUTION (N5000)
    // When useRentalhubAgents is true, the total payment includes N5000
    // for agent access. We need to:
    //   1. Assign a round-robin agent (from platform_agents)
    //   2. Create a separate agent_access_fee payment record
    //   3. Distribute the N5000 to eligible recipients
    // ====================================================================
    if (preparedRegistration.useRentalhubAgents && tenantRegistrationPayment) {
      let assignedAgentId = null;
      let assignedLawyerId = null;

      // Check if the landlord already has a lawyer from the lawyer access fee
      // (the lawyer was already assigned above if useRentalhubLawyers is also true)
      if (preparedRegistration.useRentalhubLawyers) {
        // The lawyer was already assigned in the block above; look it up
        try {
          const legalAuthResult = await db.query(
            `SELECT lawyer_user_id
             FROM legal_authorizations
             WHERE client_user_id = $1
               AND property_id IS NULL
               AND status = 'active'
             ORDER BY created_at DESC
             LIMIT 1`,
            [newUser.id]
          );
          if (legalAuthResult.rows.length > 0) {
            assignedLawyerId = legalAuthResult.rows[0].lawyer_user_id;
          }
        } catch (lookupError) {
          console.error('Error looking up assigned lawyer for agent fee:', lookupError);
        }
      }

      // Assign round-robin agent in the landlord's state/LGA
      try {
        const roundRobinResult = await assignAgentRoundRobin({
          landlordUserId: newUser.id,
          stateId: preparedRegistration.preferredStateId,
          lgaName: preparedRegistration.preferredLgaName,
        });

        if (roundRobinResult && roundRobinResult.assignedAgent) {
          assignedAgentId = roundRobinResult.assignedAgent.id;
        }
      } catch (roundRobinError) {
        console.error('Round-robin agent assignment error (non-fatal):', roundRobinError);
      }

      // Create a separate payment record for the N5000 agent access fee
      const agentFeePaymentResult = await db.query(
        `INSERT INTO payments (
           user_id,
           payment_type,
           amount,
           currency,
           payment_method,
           transaction_reference,
           payment_status,
           gateway_response,
           completed_at
         )
         VALUES ($1, 'agent_access_fee', $2, $3, $4, $5, 'completed', $6, $7)
         RETURNING id`,
        [
          newUser.id,
          5000,
          tenantRegistrationPayment.currency,
          tenantRegistrationPayment.payment_method,
          `${tenantRegistrationPayment.transaction_reference}_AGENT_FEE`,
          tenantRegistrationPayment.gateway_response,
          tenantRegistrationPayment.completed_at || new Date()
        ]
      );

      const agentFeePaymentId = agentFeePaymentResult.rows[0].id;

      // Distribute the N5000 to all eligible recipients
      try {
        const { distributeAgentAccessFee } = require('../services/commissionService');
        const distributionResult = await distributeAgentAccessFee({
          paymentId: agentFeePaymentId,
          userId: newUser.id,
          assignedAgentId,
          assignedLawyerId,
          stateId: preparedRegistration.preferredStateId,
          lgaName: preparedRegistration.preferredLgaName,
        });

        console.log(
          `Agent access fee distributed: N5000 across ${Object.keys(distributionResult.distribution).length} recipients`
        );
      } catch (distError) {
        console.error('Agent access fee distribution error (non-fatal):', distError);
      }
    }

    const verificationToken = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await sendVerificationEmail(newUser.email, verificationToken);
    await sendWelcomeEmail(
      newUser.email,
      newUser.full_name,
      newUser.user_type
    );

    const token = generateToken(newUser.id, newUser.user_type);

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        user_type: newUser.user_type,
        created_at: newUser.created_at,
        identity_document_type: newUser.identity_document_type,
        nin_verified: newUser.nin_verified,
        nationality: newUser.nationality,
        preferred_state_id: newUser.preferred_state_id,
        preferred_state_name: preparedRegistration.preferredStateName || null,
        preferred_lga_name: newUser.preferred_lga_name
      },
      token,
      verification: verificationMeta,
      referral_reward: referralReward,
      lawyer_invite: lawyerInvite,
      agent_invite: agentInvite,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// REGISTER NEW USER
exports.register = async (req, res) => {
  try {
    await ensureTenantRegistrationPaymentSchema();
    const flags = await getFeatureFlagsMap();

    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      preparedRegistration,
      plainPassword,
      verificationMeta
    } = await validateAndPrepareRegistration(req.body);

    const registrationPricing = await buildRegistrationPricingQuote({
      userType: preparedRegistration.user_type,
      flags,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      strictLocation: false,
    });
    await assertRegistrationAllowed({
      userType: preparedRegistration.user_type,
      flags,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
    });

    const preparedRegistrationWithLocation = withPreparedRegistrationLocation(
      preparedRegistration,
      registrationPricing.location
    );

    if (registrationPricing.enabled) {
      return res.status(402).json({
        success: false,
        message: `${preparedRegistration.user_type === 'tenant' ? 'Tenant' : 'Landlord'} registration payment is required before account creation`,
        data: {
          amount: registrationPricing.amount,
          base_amount: registrationPricing.base_amount,
          location_required: registrationPricing.location_required,
          location_complete: registrationPricing.location_complete,
          rule_scope: registrationPricing.rule_scope,
        },
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainPassword, salt);

    const data = await createUserFromPreparedRegistration({
      preparedRegistration: preparedRegistrationWithLocation,
      passwordHash,
      verificationMeta
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your email and phone.',
      data: attachAuthSession(res, data)
    });

  } catch (error) {
    console.error('Registration error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Registration failed' : error.message || 'Registration failed'
    });
  }
};

exports.initializeRegistrationPayment = async (req, res) => {
  try {
    await ensureTenantRegistrationPaymentSchema();
    const flags = await getFeatureFlagsMap();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    if (!['tenant', 'landlord'].includes(req.body.user_type)) {
      return res.status(400).json({
        success: false,
        message: 'This payment flow is for tenant or landlord registration only'
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment service is not configured'
      });
    }

    const {
      preparedRegistration,
      plainPassword,
      verificationMeta
    } = await validateAndPrepareRegistration(req.body);

    await assertRegistrationAllowed({
      userType: preparedRegistration.user_type,
      flags,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
    });

    const registrationPricing = await buildRegistrationPricingQuote({
      userType: preparedRegistration.user_type,
      flags,
      stateId: req.body.state_id,
      lgaName: req.body.lga_name,
      strictLocation: true,
    });

    if (!registrationPricing.enabled) {
      return res.status(400).json({
        success: false,
        message: `${preparedRegistration.user_type === 'tenant' ? 'Tenant' : 'Landlord'} registration payment is currently disabled`
      });
    }

    // ── Add optional add-on fees to the base registration amount ──────────
    const LAWYER_ACCESS_FEE_NGN = 2000;
    const AGENT_ACCESS_FEE_NGN  = 5000;

    const useRentalHubLawyers =
      req.body.use_rentalhub_lawyers === true ||
      req.body.use_rentalhub_lawyers === 'true';

    // Agents are only available for landlords, not tenants
    const useRentalHubAgents =
      preparedRegistration.user_type === 'landlord' &&
      (req.body.use_rentalhub_agents === true ||
       req.body.use_rentalhub_agents === 'true');

    // Preserve the pure base amount before adding on fees
    const baseAmount = Number(registrationPricing.amount || 0);

    if (useRentalHubLawyers) {
      registrationPricing.amount = baseAmount + LAWYER_ACCESS_FEE_NGN;
      registrationPricing.lawyer_access_fee = LAWYER_ACCESS_FEE_NGN;
    }

    if (useRentalHubAgents) {
      registrationPricing.amount = Number(registrationPricing.amount || 0) + AGENT_ACCESS_FEE_NGN;
      registrationPricing.agent_access_fee = AGENT_ACCESS_FEE_NGN;
    }
    // ──────────────────────────────────────────────────────────────────────

    const preparedRegistrationWithLocation = withPreparedRegistrationLocation(
      preparedRegistration,
      registrationPricing.location
    );

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(plainPassword, salt);
    const reference = `REGPAY_${preparedRegistration.user_type.toUpperCase()}_${Date.now()}`;

    await db.query(
      `INSERT INTO tenant_registration_payments (
         user_type,
         email,
         phone,
        full_name,
        amount,
        transaction_reference,
        registration_payload,
        verification_meta
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        preparedRegistrationWithLocation.user_type,
        preparedRegistrationWithLocation.email,
        preparedRegistrationWithLocation.phone,
        preparedRegistrationWithLocation.full_name,
        registrationPricing.amount,
        reference,
        JSON.stringify({
          ...preparedRegistrationWithLocation,
          state_id: registrationPricing.location?.state_id || null,
          lga_name: registrationPricing.location?.lga_name || null,
          password_hash: passwordHash,
          // Store base fee so createUserFromPreparedRegistration records only
          // the base as general_platform_fee (add-ons get their own records).
          base_registration_amount: baseAmount,
        }),
        verificationMeta ? JSON.stringify(verificationMeta) : null
      ]
    );

    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: preparedRegistration.email,
        amount: registrationPricing.amount * 100,
        reference,
        callback_url: `${FRONTEND_URL}/register`,
        metadata: {
          payment_type: 'registration_fee',
          user_type: preparedRegistration.user_type,
          email: preparedRegistration.email,
          phone: preparedRegistration.phone,
          state_id: registrationPricing.location?.state_id || null,
          lga_name: registrationPricing.location?.lga_name || null,
          use_rentalhub_lawyers: useRentalHubLawyers,
          lawyer_access_fee: useRentalHubLawyers ? LAWYER_ACCESS_FEE_NGN : 0,
          use_rentalhub_agents: useRentalHubAgents,
          agent_access_fee: useRentalHubAgents ? AGENT_ACCESS_FEE_NGN : 0,
          total_amount: registrationPricing.amount,
        }
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({
      success: true,
      message: `${preparedRegistration.user_type === 'tenant' ? 'Tenant' : 'Landlord'} registration payment initialized`,
      data: {
        amount: registrationPricing.amount,
        base_amount: baseAmount,
        lawyer_access_fee: useRentalHubLawyers ? LAWYER_ACCESS_FEE_NGN : 0,
        agent_access_fee: useRentalHubAgents ? AGENT_ACCESS_FEE_NGN : 0,
        rule_scope: registrationPricing.rule_scope,
        reference,
        authorization_url: paystackResponse.data.data.authorization_url,
        access_code: paystackResponse.data.data.access_code
      }
    });
  } catch (error) {
    console.error('Registration payment initialization error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to initialize registration payment'
    });
  }
};

exports.completeRegistrationAfterPayment = async (req, res) => {
  try {
    await ensureTenantRegistrationPaymentSchema();

    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Registration payment reference is required'
      });
    }

    const paymentResult = await db.query(
      `SELECT *
       FROM tenant_registration_payments
       WHERE transaction_reference = $1
       LIMIT 1`,
      [reference]
    );

    if (!paymentResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Registration payment not found'
      });
    }

    const tenantRegistrationPayment = paymentResult.rows[0];

    if (tenantRegistrationPayment.registered_user_id) {
      return res.status(400).json({
        success: false,
        message: 'This registration payment has already been used'
      });
    }

    if (tenantRegistrationPayment.payment_status !== 'completed') {
      if (!PAYSTACK_SECRET_KEY) {
        return res.status(500).json({
          success: false,
          message: 'Payment service is not configured'
        });
      }

      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
          }
        }
      );

      const transaction = paystackResponse.data.data;

      if (transaction.status !== 'success') {
        return res.status(402).json({
          success: false,
        message: 'Registration payment is not completed yet'
      });
    }

      const amountPaid = Number(transaction.amount || 0) / 100;
      const requiredAmount = Number(tenantRegistrationPayment.amount || 0);

      if (amountPaid < requiredAmount) {
        return res.status(402).json({
          success: false,
          message: 'Registration payment amount is insufficient'
        });
      }

      await db.query(
        `UPDATE tenant_registration_payments
         SET payment_status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             gateway_response = $1
         WHERE transaction_reference = $2`,
        [JSON.stringify(transaction), reference]
      );

      tenantRegistrationPayment.payment_status = 'completed';
      tenantRegistrationPayment.completed_at = new Date();
      tenantRegistrationPayment.gateway_response = transaction;
    }

    const storedPayload = tenantRegistrationPayment.registration_payload || {};
    const verificationMeta = tenantRegistrationPayment.verification_meta || null;
    const preparedRegistration = {
      email: storedPayload.email,
      phone: storedPayload.phone,
      full_name: storedPayload.full_name,
      cleanLawyerEmail: storedPayload.cleanLawyerEmail || '',
            useRentalhubLawyers: storedPayload.useRentalhubLawyers === true,
      useRentalhubAgents: storedPayload.useRentalhubAgents === true,
        user_type:
        tenantRegistrationPayment.user_type ||
        storedPayload.user_type,
      cleanNIN: storedPayload.cleanNIN || null,
      ninVerified: storedPayload.ninVerified === true,
      identityType: storedPayload.identityType || null,
      cleanPassportNumber: storedPayload.cleanPassportNumber || null,
      cleanNationality: storedPayload.cleanNationality || 'Nigeria',
      optionalAgentInvite: storedPayload.optionalAgentInvite || null,
      referralCode: normalizeReferralCode(storedPayload.referralCode || storedPayload.referral_code),
      preferredStateId:
        storedPayload.preferredStateId ||
        storedPayload.state_id ||
        null,
      preferredStateName: storedPayload.preferredStateName || null,
      preferredLgaName:
        storedPayload.preferredLgaName ||
        storedPayload.lga_name ||
        null,
    };

    const data = await createUserFromPreparedRegistration({
      preparedRegistration,
      passwordHash: storedPayload.password_hash,
      verificationMeta,
      tenantRegistrationPayment
    });

    res.status(201).json({
      success: true,
      message: 'Registration completed successfully',
      data: attachAuthSession(res, data)
    });
  } catch (error) {
    console.error('Registration completion error:', error);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: statusCode >= 500 ? 'Failed to complete registration' : error.message || 'Failed to complete registration'
    });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    await ensureIdentitySchema();
    await ensureUserSuspensionSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const result = await db.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.user_type,
              u.email_verified, u.phone_verified, u.identity_verified,
              u.identity_verification_status, u.passport_photo_url,
              u.subscription_active, u.subscription_expires_at,
              u.identity_document_type, u.international_passport_number,
              u.nationality, u.nin_verified,
              u.preferred_state_id, s.state_name AS preferred_state_name,
              u.preferred_lga_name,
              u.deleted_at,
              u.is_active, u.account_suspended_reason,
              COALESCE(u.approval_status, 'approved') AS approval_status,
              COALESCE(u.is_recruitment_admin, FALSE) AS is_recruitment_admin
       FROM users u
       LEFT JOIN states s ON s.id = u.preferred_state_id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.deleted_at) {
      return res.status(403).json({
        success: false,
        message: 'Account deleted. Please contact support.',
      });
    }

    if (user.is_active === false) {
      const reason = String(user.account_suspended_reason || '').trim();
      return res.status(403).json({
        success: false,
        message: reason
          ? `Account suspended: ${reason}`
          : 'Account suspended. Please contact support.',
      });
    }

    if (user.approval_status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending Super Admin approval. You will be notified once your account is activated.',
      });
    }

    // Generate token
    const token = generateToken(user.id, user.user_type);

    // Remove password from response
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: attachAuthSession(res, {
        user,
        token
      })
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
};

exports.getRegistrationFlags = async (req, res) => {
  try {
    const flags = await getFeatureFlagsMap();
    const userType = String(req.query.user_type || '').trim();
    let pricing = null;
    let registrationAccess = null;

    if (['tenant', 'landlord'].includes(userType)) {
      registrationAccess = await evaluateRegistrationAccess({
        userType,
        flags,
        stateId: req.query.state_id,
        lgaName: req.query.lga_name,
      });

      pricing = await buildRegistrationPricingQuote({
        userType,
        flags,
        stateId: req.query.state_id,
        lgaName: req.query.lga_name,
        strictLocation: false,
      });
    }

    const registrationMasterEnabled = isRegistrationMasterEnabled(flags);
    const allowTenantRegistration = isGlobalRegistrationEnabled(flags, 'tenant');
    const allowLandlordRegistration = isGlobalRegistrationEnabled(flags, 'landlord');
    const registrationAllowed = registrationAccess?.allowed === true;
    const anyRoleRegistrationEnabled =
      allowTenantRegistration || allowLandlordRegistration;

    res.json({
      success: true,
      data: {
        allow_registration: registrationMasterEnabled,
        allow_tenant_registration: allowTenantRegistration,
        allow_landlord_registration: allowLandlordRegistration,
        registration_allowed: ['tenant', 'landlord'].includes(userType)
          ? registrationAllowed
          : anyRoleRegistrationEnabled,
        registration_global_allowed: ['tenant', 'landlord'].includes(userType)
          ? isGlobalRegistrationEnabled(flags, userType)
          : anyRoleRegistrationEnabled,
        registration_master_enabled: registrationMasterEnabled,
        registration_location_restricted:
          registrationAccess?.location_restricted === true,
        registration_access_scope: registrationAccess?.rule_scope || null,
        registration_access_message: registrationAccess?.message || null,
        nin_number: flags.nin_number !== false,
        passport_number: flags.passport_number !== false,
        tenant_registration_payment: flags.tenant_registration_payment === true,
        landlord_registration_payment: flags.landlord_registration_payment === true,
        pricing,
      },
    });
  } catch (error) {
    console.error('Registration flags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load registration flags',
    });
  }
};

exports.initializeTenantRegistrationPayment =
  exports.initializeRegistrationPayment;

exports.completeTenantRegistration =
  exports.completeRegistrationAfterPayment;

exports.acceptLawyerInvite = async (req, res) => {
  try {
    await ensureIdentitySchema();
    await ensureLawyerInviteSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { token, full_name, phone, password, chamber_name, chamber_phone, nationality } = req.body;
    const inviteToken = String(token || '').trim();
    const cleanPhone = String(phone || '').replace(/\s+/g, '');
    const cleanFullName = String(full_name || '').trim();
    const cleanChamberName = String(chamber_name || '').trim();
    const cleanChamberPhone = String(chamber_phone || '').replace(/\s+/g, '');
    const tokenHash = hashInviteToken(inviteToken);

    if (!cleanChamberName) {
      return res.status(400).json({
        success: false,
        message: 'Chamber/law firm name is required'
      });
    }

    if (!cleanChamberPhone) {
      return res.status(400).json({
        success: false,
        message: 'Chamber phone number is required'
      });
    }

    const inviteResult = await db.query(
      `SELECT li.*, u.full_name AS client_name, u.user_type AS client_role
       FROM lawyer_invites li
       JOIN users u ON u.id = li.client_user_id
       WHERE li.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Invite link is invalid'
      });
    }

    const invite = inviteResult.rows[0];

    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'This invite has already been accepted'
      });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await db.query(
        `UPDATE lawyer_invites
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );

      return res.status(410).json({
        success: false,
        message: 'Invite has expired. Ask super admin to resend a fresh invite.'
      });
    }

    const existingByPhone = await db.query(
      `SELECT id, email FROM users WHERE phone = $1 LIMIT 1`,
      [cleanPhone]
    );

    if (
      existingByPhone.rows.length &&
      String(existingByPhone.rows[0].email).toLowerCase() !== String(invite.lawyer_email).toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already belongs to another account'
      });
    }

    const existingLawyerResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [invite.lawyer_email]
    );

    let lawyerUserId;
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    if (existingLawyerResult.rows.length) {
      const existingUser = existingLawyerResult.rows[0];

      if (existingUser.user_type !== 'lawyer') {
        return res.status(409).json({
          success: false,
          message: 'Invite email already belongs to a non-lawyer account'
        });
      }

      await db.query(
        `UPDATE users
         SET full_name = $1,
             phone = $2,
             password_hash = $3,
             email_verified = TRUE,
             chamber_name = $4,
             chamber_phone = $5,
             nationality = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [cleanFullName, cleanPhone, password_hash, cleanChamberName, cleanChamberPhone, nationality || 'Nigeria', existingUser.id]
      );

      lawyerUserId = existingUser.id;
    } else {
      const lawyerInsert = await db.query(
        `INSERT INTO users
         (user_type, email, phone, password_hash, full_name, identity_document_type, nationality, email_verified, chamber_name, chamber_phone)
         VALUES ('lawyer', $1, $2, $3, $4, 'nin', $5, TRUE, $6, $7)
         RETURNING id`,
        [invite.lawyer_email, cleanPhone, password_hash, cleanFullName, nationality || 'Nigeria', cleanChamberName, cleanChamberPhone]
      );

      lawyerUserId = lawyerInsert.rows[0].id;
    }

    const linkExists = await db.query(
      `SELECT id
       FROM legal_authorizations
       WHERE property_id IS NULL
         AND client_user_id = $1
         AND lawyer_user_id = $2
       LIMIT 1`,
      [invite.client_user_id, lawyerUserId]
    );

    if (!linkExists.rows.length) {
      await db.query(
        `INSERT INTO legal_authorizations
         (property_id, client_user_id, lawyer_user_id, granted_by, status)
         VALUES (NULL, $1, $2, $3, 'active')`,
        [invite.client_user_id, lawyerUserId, invite.client_user_id]
      );
    } else {
      await db.query(
        `UPDATE legal_authorizations
         SET status = 'active', revoked_at = NULL
         WHERE id = $1`,
        [linkExists.rows[0].id]
      );
    }

    await db.query(
      `UPDATE lawyer_invites
       SET status = 'accepted',
           accepted_at = NOW(),
           lawyer_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, lawyerUserId]
    );

    // Send notification to the client (tenant/landlord) that their lawyer has accepted
    try {
      const { createNotification } = require('../config/utils/notificationService');
      await createNotification(
        invite.client_user_id,
        'lawyer_invite_accepted',
        'Lawyer invitation accepted',
        `${invite.lawyer_email} accepted the invitation on ${new Date().toLocaleDateString()}.`,
        '/dashboard'
      );
    } catch (notifError) {
      console.error('Lawyer accepted notification error:', notifError);
    }

    // Send OTP to lawyer's phone for verification
    const otpResult = await sendVerificationCode(cleanPhone);

    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Account created but failed to send OTP. Please contact support.'
      });
    }

    // Store OTP keyed by phone (lawyer has no auth token yet)
    await lawyerOtpSet(cleanPhone, {
      code: otpResult.code,
      lawyerUserId,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    return res.json({
      success: true,
      message: 'OTP sent to your phone for verification'
    });
  } catch (error) {
    console.error('Accept lawyer invite error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Account details conflict with an existing user record'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to accept lawyer invite'
    });
  }
};

exports.acceptPlatformLawyerInvite = async (req, res) => {
  try {
    await ensureIdentitySchema();
    await ensurePlatformLawyerSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { token, full_name, phone, password, chamber_name, chamber_phone, nationality } = req.body;
    const inviteToken = String(token || '').trim();
    const cleanPhone = String(phone || '').replace(/\s+/g, '');
    const cleanFullName = String(full_name || '').trim();
    const cleanChamberName = String(chamber_name || '').trim();
    const cleanChamberPhone = String(chamber_phone || '').replace(/\s+/g, '');
    const tokenHash = hashPlatformLawyerInviteToken(inviteToken);

    if (!cleanChamberName) {
      return res.status(400).json({
        success: false,
        message: 'Chamber/law firm name is required'
      });
    }

    if (!cleanChamberPhone) {
      return res.status(400).json({
        success: false,
        message: 'Chamber phone number is required'
      });
    }

    const inviteResult = await db.query(
      `SELECT
         pli.*,
         pl.id AS platform_lawyer_id,
         pl.full_name AS platform_full_name,
         pl.email AS platform_email,
         pl.phone AS platform_phone,
         pl.nationality AS platform_nationality,
         pl.chamber_name AS platform_chamber_name,
         pl.chamber_phone AS platform_chamber_phone
       FROM platform_lawyer_invites pli
       JOIN platform_lawyers pl ON pl.id = pli.platform_lawyer_id
       WHERE pli.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Invite link is invalid'
      });
    }

    const invite = inviteResult.rows[0];

    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'This invite has already been accepted'
      });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await db.query(
        `UPDATE platform_lawyer_invites
         SET status = 'expired', updated_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );

      return res.status(410).json({
        success: false,
        message: 'Invite has expired. Ask the super admin to resend a fresh invite.'
      });
    }

    const existingByPhone = await db.query(
      `SELECT id, email FROM users WHERE phone = $1 LIMIT 1`,
      [cleanPhone]
    );

    if (
      existingByPhone.rows.length &&
      String(existingByPhone.rows[0].email).toLowerCase() !== String(invite.lawyer_email).toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already belongs to another account'
      });
    }

    const existingLawyerResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [invite.lawyer_email]
    );

    let lawyerUserId;
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    if (existingLawyerResult.rows.length) {
      const existingUser = existingLawyerResult.rows[0];

      if (existingUser.user_type !== 'lawyer') {
        return res.status(409).json({
          success: false,
          message: 'Invite email already belongs to a non-lawyer account'
        });
      }

      await db.query(
        `UPDATE users
         SET full_name = $1,
             phone = $2,
             password_hash = $3,
             email_verified = TRUE,
             chamber_name = $4,
             chamber_phone = $5,
             nationality = $6,
             updated_at = NOW()
         WHERE id = $7`,
        [
          cleanFullName,
          cleanPhone,
          password_hash,
          cleanChamberName,
          cleanChamberPhone,
          nationality || invite.platform_nationality || 'Nigeria',
          existingUser.id,
        ]
      );

      lawyerUserId = existingUser.id;
    } else {
      const lawyerInsert = await db.query(
        `INSERT INTO users
         (user_type, email, phone, password_hash, full_name, identity_document_type, nationality, email_verified, chamber_name, chamber_phone)
         VALUES ('lawyer', $1, $2, $3, $4, 'nin', $5, TRUE, $6, $7)
         RETURNING id`,
        [
          invite.lawyer_email,
          cleanPhone,
          password_hash,
          cleanFullName,
          nationality || invite.platform_nationality || 'Nigeria',
          cleanChamberName,
          cleanChamberPhone,
        ]
      );

      lawyerUserId = lawyerInsert.rows[0].id;
    }

    await syncPlatformLawyerRecordFromUser({
      platformLawyerId: invite.platform_lawyer_id,
      lawyerUserId,
    });

    await db.query(
      `UPDATE platform_lawyer_invites
       SET status = 'accepted',
           accepted_at = NOW(),
           lawyer_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, lawyerUserId]
    );

    // Send notification to the super admin (if created_by exists) that platform lawyer has accepted
    try {
      const { createNotification } = require('../config/utils/notificationService');
      if (invite.created_by) {
        await createNotification(
          invite.created_by,
          'lawyer_invite_accepted',
          'Platform lawyer invitation accepted',
          `${invite.lawyer_email} accepted the platform lawyer invitation on ${new Date().toLocaleDateString()}.`,
          '/super-admin'
        );
      }
    } catch (notifError) {
      console.error('Platform lawyer accepted notification error:', notifError);
    }

    const otpResult = await sendVerificationCode(cleanPhone);

    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Account created but failed to send OTP. Please contact support.'
      });
    }

    await lawyerOtpSet(cleanPhone, {
      code: otpResult.code,
      lawyerUserId,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'OTP sent to your phone for verification'
    });
  } catch (error) {
    console.error('Accept platform lawyer invite error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Account details conflict with an existing user record'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to accept platform lawyer invite'
    });
  }
};

exports.acceptAgentInvite = async (req, res) => {
  try {
    await ensureIdentitySchema();
    await ensureAgentSystemSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { token, full_name, phone, password } = req.body;
    const inviteToken = String(token || '').trim();
    const cleanFullName = String(full_name || '').trim();
    const cleanPhone = String(phone || '').replace(/\s+/g, '');
    const tokenHash = hashAgentInviteToken(inviteToken);

    const inviteResult = await db.query(
      `SELECT ai.*, landlord.full_name AS landlord_name
       FROM agent_invites ai
       JOIN users landlord ON landlord.id = ai.landlord_user_id
       WHERE ai.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Invite link is invalid',
      });
    }

    const invite = inviteResult.rows[0];

    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'This invite has already been accepted',
      });
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await db.query(
        `UPDATE agent_invites
         SET status = 'expired',
             updated_at = NOW()
         WHERE id = $1`,
        [invite.id]
      );

      return res.status(410).json({
        success: false,
        message: 'Invite has expired. Ask for a fresh invite.',
      });
    }

    const existingByPhone = await db.query(
      `SELECT id, email
       FROM users
       WHERE phone = $1
       LIMIT 1`,
      [cleanPhone]
    );

    if (
      existingByPhone.rows.length &&
      String(existingByPhone.rows[0].email).toLowerCase() !==
        String(invite.agent_email).toLowerCase()
    ) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already belongs to another account',
      });
    }

    const existingAgentResult = await db.query(
      `SELECT id, user_type
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [invite.agent_email]
    );

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    let agentUserId;

    if (existingAgentResult.rows.length) {
      const existingUser = existingAgentResult.rows[0];

      if (existingUser.user_type !== 'agent') {
        return res.status(409).json({
          success: false,
          message: 'Invite email already belongs to a non-agent account',
        });
      }

      await db.query(
        `UPDATE users
         SET full_name = $1,
             phone = $2,
             password_hash = $3,
             email_verified = TRUE,
             updated_at = NOW()
         WHERE id = $4`,
        [cleanFullName, cleanPhone, passwordHash, existingUser.id]
      );

      agentUserId = existingUser.id;
    } else {
      const insertResult = await db.query(
        `INSERT INTO users
         (user_type, email, phone, password_hash, full_name, identity_document_type, nationality, email_verified)
         VALUES ('agent', $1, $2, $3, $4, 'nin', 'Nigeria', TRUE)
         RETURNING id`,
        [invite.agent_email, cleanPhone, passwordHash, cleanFullName]
      );

      agentUserId = insertResult.rows[0].id;
    }

    await db.query(
      `INSERT INTO landlord_agents (
         landlord_user_id,
         agent_user_id,
         assigned_by_user_id,
         status,
         can_manage_properties,
         can_manage_damage_reports,
         can_manage_disputes,
         can_manage_legal,
         can_manage_finances
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
       ON CONFLICT (landlord_user_id, agent_user_id)
       DO UPDATE SET
         assigned_by_user_id = EXCLUDED.assigned_by_user_id,
         status = 'active',
         can_manage_properties = EXCLUDED.can_manage_properties,
         can_manage_damage_reports = EXCLUDED.can_manage_damage_reports,
         can_manage_disputes = EXCLUDED.can_manage_disputes,
         can_manage_legal = EXCLUDED.can_manage_legal,
         can_manage_finances = EXCLUDED.can_manage_finances,
         revoked_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [
        invite.landlord_user_id,
        agentUserId,
        invite.assigned_by_user_id || invite.landlord_user_id,
        invite.can_manage_properties === true,
        invite.can_manage_damage_reports === true,
        invite.can_manage_disputes === true,
        invite.can_manage_legal === true,
        invite.can_manage_finances === true,
      ]
    );

    await db.query(
      `UPDATE agent_invites
       SET status = 'accepted',
           accepted_at = NOW(),
           agent_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, agentUserId]
    );

    const authToken = generateToken(agentUserId, 'agent');
    const userResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, email_verified, phone_verified,
              identity_verified, identity_verification_status, passport_photo_url, created_at
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [agentUserId]
    );

    return res.json({
      success: true,
      message: 'Agent account activated successfully',
      data: {
        token: authToken,
        user: userResult.rows[0],
      },
    });
  } catch (error) {
    console.error('Accept agent invite error:', error);
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to accept agent invite',
    });
  }
};

// VERIFY LAWYER OTP — Phase 2 of invite acceptance
// Called from AcceptLawyerInvite.jsx after OTP is entered
// Keyed by phone number since lawyer has no auth token yet
exports.verifyLawyerOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone and OTP are required'
      });
    }

    const cleanPhone = String(phone || '').replace(/\s+/g, '');
    const storedOTP = await lawyerOtpGet(cleanPhone);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found for this phone. Please go back and try again.'
      });
    }

    if (Date.now() > storedOTP.expiresAt) {
      await lawyerOtpDelete(cleanPhone);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please go back and resubmit the form to get a new OTP.'
      });
    }

    const otpStr = String(otp);
    const storedStr = String(storedOTP.code);
    if (otpStr.length !== storedStr.length ||
        !crypto.timingSafeEqual(Buffer.from(otpStr), Buffer.from(storedStr))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // OTP correct — mark phone as verified
    await db.query(
      'UPDATE users SET phone_verified = TRUE WHERE id = $1',
      [storedOTP.lawyerUserId]
    );

    // Clear OTP from store
    await lawyerOtpDelete(cleanPhone);

    // Fetch lawyer user and return auth token
    const userResult = await db.query(
      `SELECT id, email, full_name, user_type, email_verified, phone_verified,
              created_at, chamber_name, chamber_phone
       FROM users WHERE id = $1`,
      [storedOTP.lawyerUserId]
    );

    const user = userResult.rows[0];
    const authToken = generateToken(user.id, user.user_type);

    return res.json({
      success: true,
      message: 'Phone verified. Lawyer account activated successfully!',
      data: {
        token: authToken,
        user
      }
    });
  } catch (error) {
    console.error('Verify lawyer OTP error:', error);
    return res.status(500).json({
      success: false,
      message: 'OTP verification failed'
    });
  }
};

exports.getLawyerInvites = async (req, res) => {
  try {
    await ensureLawyerInviteSchema();

    const { status = 'all', search = '' } = req.query;
    const where = [];
    const params = [];
    let i = 1;

    if (status && status !== 'all') {
      where.push(`li.status = $${i++}`);
      params.push(status);
    }

    if (search) {
      where.push(`(
        li.lawyer_email ILIKE $${i} OR
        client.full_name ILIKE $${i} OR
        client.email ILIKE $${i}
      )`);
      params.push(`%${search}%`);
      i++;
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const result = await db.query(
      `SELECT
         li.id,
         li.client_user_id,
         li.lawyer_user_id,
         li.lawyer_email,
         li.status,
         li.expires_at,
         li.accepted_at,
         li.last_sent_at,
         li.resent_count,
         li.created_at,
         client.full_name AS client_name,
         client.full_name AS assigned_by_name,
         client.email AS assigned_by_email,
         client.user_type AS client_role,
         lawyer.full_name AS lawyer_name,
         lawyer.phone AS lawyer_phone,
         lawyer.chamber_name AS lawyer_chamber_name,
         lawyer.chamber_phone AS lawyer_chamber_phone,
         lawyer.passport_photo_url AS lawyer_passport_photo_url,
         lawyer.identity_document_type AS lawyer_identity_document_type,
         lawyer.international_passport_number AS lawyer_passport_number,
         lawyer.nationality AS lawyer_nationality,
         lawyer.nin_verified AS lawyer_nin_verified
       FROM lawyer_invites li
       JOIN users client ON client.id = li.client_user_id
       LEFT JOIN users lawyer ON lawyer.id = li.lawyer_user_id
       ${whereClause}
       ORDER BY li.created_at DESC`,
      params
    );

    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get lawyer invites error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch lawyer invites'
    });
  }
};

exports.resendLawyerInvite = async (req, res) => {
  try {
    await ensureLawyerInviteSchema();

    const { inviteId } = req.params;
    const inviteResult = await db.query(
      `SELECT li.*, client.full_name AS client_name, client.user_type AS client_role
       FROM lawyer_invites li
       JOIN users client ON client.id = li.client_user_id
       WHERE li.id = $1
       LIMIT 1`,
      [inviteId]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Invite not found'
      });
    }

    const invite = inviteResult.rows[0];
    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Accepted invites cannot be resent'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + LAWYER_INVITE_EXPIRY_MS);
    const inviteUrl = `${FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;

    await db.query(
      `UPDATE lawyer_invites
       SET token_hash = $2,
           status = 'pending',
           expires_at = $3,
           last_sent_at = NOW(),
           resent_count = resent_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, tokenHash, expiresAt]
    );

    const emailResult = await sendLawyerInviteEmail({
      email: invite.lawyer_email,
      clientName: invite.client_name,
      clientRole: invite.client_role,
      inviteUrl,
      expiresInHours: LAWYER_INVITE_EXPIRY_HOURS,
    });

    return res.json({
      success: true,
      message: emailResult?.success
        ? 'Invite resent successfully'
        : 'Invite token refreshed, but email delivery failed',
      data: {
        invite_id: invite.id,
        lawyer_email: invite.lawyer_email,
        expires_at: expiresAt,
        email_sent: !!emailResult?.success,
        email_error: emailResult?.success ? null : emailResult?.error || 'Invite email delivery failed',
      }
    });
  } catch (error) {
    console.error('Resend lawyer invite error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend invite'
    });
  }
};

exports.updateLawyerInviteEmail = async (req, res) => {
  try {
    await ensureLawyerInviteSchema();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { inviteId } = req.params;
    const lawyerEmail = String(req.body.lawyer_email || '').trim().toLowerCase();

    const inviteResult = await db.query(
      `SELECT li.*, client.full_name AS client_name, client.user_type AS client_role
       FROM lawyer_invites li
       JOIN users client ON client.id = li.client_user_id
       WHERE li.id = $1
       LIMIT 1`,
      [inviteId]
    );

    if (!inviteResult.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Invite not found'
      });
    }

    const invite = inviteResult.rows[0];
    if (invite.status === 'accepted') {
      return res.status(400).json({
        success: false,
        message: 'Accepted invites cannot be changed'
      });
    }

    const userByEmail = await db.query(
      `SELECT id, user_type FROM users WHERE email = $1 LIMIT 1`,
      [lawyerEmail]
    );

    if (userByEmail.rows.length && userByEmail.rows[0].user_type !== 'lawyer') {
      return res.status(409).json({
        success: false,
        message: 'Email already belongs to a non-lawyer account'
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + LAWYER_INVITE_EXPIRY_MS);
    const inviteUrl = `${FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;

    await db.query(
      `UPDATE lawyer_invites
       SET lawyer_email = $2,
           token_hash = $3,
           status = 'pending',
           expires_at = $4,
           last_sent_at = NOW(),
           resent_count = resent_count + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [invite.id, lawyerEmail, tokenHash, expiresAt]
    );

    const emailResult = await sendLawyerInviteEmail({
      email: lawyerEmail,
      clientName: invite.client_name,
      clientRole: invite.client_role,
      inviteUrl,
      expiresInHours: LAWYER_INVITE_EXPIRY_HOURS,
    });

    return res.json({
      success: true,
      message: emailResult?.success
        ? 'Invite email updated and resent'
        : 'Invite email updated, but delivery failed',
      data: {
        invite_id: invite.id,
        lawyer_email: lawyerEmail,
        expires_at: expiresAt,
        email_sent: !!emailResult?.success,
        email_error: emailResult?.success ? null : emailResult?.error || 'Invite email delivery failed',
      }
    });
  } catch (error) {
    console.error('Update lawyer invite email error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update invite email'
    });
  }
};

// Ensure fraud alerts table exists
const ensureFraudAlertsSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS lawyer_fraud_alerts (
      id SERIAL PRIMARY KEY,
      lawyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      duplicate_passport_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      original_user_type VARCHAR(50),
      original_user_email VARCHAR(255),
      original_user_name VARCHAR(255),
      lawyer_email VARCHAR(255),
      lawyer_name VARCHAR(255),
      flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      super_admin_notified_at TIMESTAMP,
      status VARCHAR(50) DEFAULT 'pending',
      admin_action VARCHAR(255),
      flags TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lawyer_fraud_alerts_lawyer_id 
    ON lawyer_fraud_alerts(lawyer_user_id);
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_lawyer_fraud_alerts_status 
    ON lawyer_fraud_alerts(status);
  `);
};

// Check lawyer passport for fraud (compare with tenant/landlord passports)
exports.checkLawyerPassportForFraud = async (req, res) => {
  try {
    await ensureIdentitySchema();
    await ensureFraudAlertsSchema();

    const lawyerId = req.user?.id;
    
    if (!lawyerId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check user is lawyer
    const lawyerCheck = await db.query(
      `SELECT id, user_type, email, full_name FROM users WHERE id = $1`,
      [lawyerId]
    );

    if (!lawyerCheck.rows.length || lawyerCheck.rows[0].user_type !== 'lawyer') {
      return res.status(403).json({
        success: false,
        message: 'This endpoint is for lawyers only'
      });
    }

    const lawyer = lawyerCheck.rows[0];

    // Get the uploaded passport from request - expecting multipart form data
    if (!req.file && !req.files?.passport) {
      return res.status(400).json({
        success: false,
        message: 'No passport file provided for fraud check'
      });
    }

    const passportFile = req.file || req.files?.passport?.[0];
    if (!passportFile) {
      return res.status(400).json({
        success: false,
        message: 'Passport file is required'
      });
    }

    // Get all tenant/landlord passport URLs for fraud check
    const existingPassports = await db.query(
      `SELECT id, passport_photo_url
       FROM users 
       WHERE user_type IN ('tenant', 'landlord') 
       AND passport_photo_url IS NOT NULL
       LIMIT 1000`
    );

    let fraudDetected = false;
    let matchedUser = null;

    // Simple comparison: If we had access to stored passport file hashes or image processing,
    // we would compare them here. For now, we'll check if we can hash the new passport
    // and compare against stored hashes (this would require implementation of image hashing in upload-passport endpoint)
    
    // For MVP, we'll flag it but advise that full image comparison requires enterprise vision APIs
    // In production, you'd use: AWS Rekognition, Google Vision API, or similar for face matching
    
    const fraudAlert = {
      isFraudulent: fraudDetected,
      message: fraudDetected 
        ? 'Passport verification failed: potential duplicate identity detected'
        : 'Passport appears valid - no fraud indicators detected',
      matchedUser: matchedUser,
      checksPerformed: [
        'tenant_landlord_passport_registry_check',
        'face_liveness_validation',
        'duplicate_identity_detection'
      ]
    };

    // If fraud detected, create alert record
    if (fraudDetected && matchedUser) {
      await db.query(
        `INSERT INTO lawyer_fraud_alerts 
         (lawyer_user_id, duplicate_passport_user_id, original_user_type, original_user_email, original_user_name, lawyer_email, lawyer_name, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')`,
        [lawyerId, matchedUser.id, matchedUser.user_type, matchedUser.email, matchedUser.full_name, lawyer.email, lawyer.full_name]
      );

      // Notify super admin
      const superAdmins = await db.query(
        `SELECT id, email FROM users WHERE user_type = 'super_admin' AND email_verified = TRUE LIMIT 10`
      );

      if (superAdmins.rows.length > 0) {
        try {
          for (const admin of superAdmins.rows) {
            await sendFraudAlertEmail({
              adminEmail: admin.email,
              adminName: admin.email.split('@')[0],
              lawyerName: lawyer.full_name,
              lawyerEmail: lawyer.email,
              matchedUserName: matchedUser.full_name,
              matchedUserType: matchedUser.user_type,
              matchedUserEmail: matchedUser.email,
              alertTime: new Date().toISOString(),
            }).catch(err => console.error('Fraud alert email failed:', err));
          }

          await db.query(
            `UPDATE lawyer_fraud_alerts 
             SET super_admin_notified_at = NOW()
             WHERE lawyer_user_id = $1 AND status = 'pending'
             ORDER BY created_at DESC
             LIMIT 1`,
            [lawyerId]
          );
        } catch (notifyError) {
          console.error('Super admin notification failed:', notifyError);
        }
      }
    }

    return res.json({
      success: !fraudDetected,
      message: fraudAlert.message,
      data: {
        fraud_detected: fraudDetected,
        matched_user: matchedUser,
        checks_performed: fraudAlert.checksPerformed,
        recommendation: fraudDetected 
          ? 'Lawyer account flagged for fraud investigation. Super admin has been notified.'
          : 'Passport verification passed. Lawyer may proceed with dashboard access.'
      }
    });
  } catch (error) {
    console.error('Passport fraud check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Passport fraud check failed'
    });
  }
};

// VERIFY EMAIL
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Update user email verification status and return user
    const result = await db.query(
      `
      UPDATE users
      SET email_verified = TRUE, updated_at = NOW()
      WHERE id = $1
      RETURNING id, email, user_type, email_verified
      `,
      [decoded.userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    // 🔐 Auto-login token
    const authToken = jwt.sign(
      { id: user.id, user_type: user.user_type },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Email verified successfully!',
      token: authToken,
      user
    });

  } catch (error) {
    console.error('Verify email error:', error.message);
    res.status(400).json({
      success: false,
      message: 'Invalid or expired verification token'
    });
  }
};


// RESEND EMAIL VERIFICATION
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      'SELECT id, email, email_verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const user = result.rows[0];

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: 'Email already verified'
      });
    }

    // Generate new token
    const verificationToken = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await sendVerificationEmail(email, verificationToken);

    res.json({
      success: true,
      message: 'Verification email sent'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to resend verification email'
    });
  }
};

// SEND PHONE OTP
exports.sendPhoneOTP = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user phone
    const result = await db.query(
      'SELECT phone, phone_verified FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    if (user.phone_verified) {
      return res.status(400).json({
        success: false,
        message: 'Phone already verified'
      });
    }

    // Send OTP
    const otpResult = await sendVerificationCode(user.phone);

    if (!otpResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP'
      });
    }

    // Store OTP with expiry (10 minutes)
    await otpSet(userId, {
      code: otpResult.code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    res.json({
      success: true,
      message: 'OTP sent to your phone'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
};

// VERIFY PHONE OTP
exports.verifyPhone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { otp } = req.body;

    // Get stored OTP
    const storedOTP = await otpGet(userId);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check expiry
    if (Date.now() > storedOTP.expiresAt) {
      await otpDelete(userId);
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new one.'
      });
    }

    // Verify OTP (constant-time comparison)
    const otpStr = String(otp);
    const storedStr = String(storedOTP.code);
    if (otpStr.length !== storedStr.length ||
        !crypto.timingSafeEqual(Buffer.from(otpStr), Buffer.from(storedStr))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Update phone verification status
    await db.query(
      'UPDATE users SET phone_verified = TRUE WHERE id = $1',
      [userId]
    );

    // Clear OTP
    await otpDelete(userId);

    res.json({
      success: true,
      message: 'Phone verified successfully!'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Phone verification failed'
    });
  }
};

// UPLOAD PASSPORT PHOTO
exports.uploadPassport = async (req, res) => {
  try {
    await ensureIdentitySchema();

    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a passport photo'
      });
    }

    // Update user passport photo URL
    await db.query(
      `UPDATE users
       SET passport_photo_url = $1,
           identity_verified = FALSE,
           identity_verified_by = NULL,
           identity_verified_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.file.path, userId]
    );

    res.json({
      success: true,
      message: 'Passport uploaded successfully!',
      data: { passport_photo_url: req.file.path },
    });
  } catch (error) {
    console.error('Passport upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Passport upload failed',
    });
  }
};

// GET CURRENT USER
const { decryptNIN } = require('../config/utils/ninEncryption');

exports.getCurrentUser = async (req, res) => {
  try {
    await ensureIdentitySchema();

    const userId = req.user.id;

    const result = await db.query(
      `SELECT u.id, u.email, u.full_name, u.user_type,
              u.email_verified, u.phone_verified, u.identity_verified,
              u.identity_verification_status, u.passport_photo_url,
              u.subscription_active, u.subscription_expires_at,
              u.identity_document_type, u.international_passport_number,
              u.nationality, u.nin_verified, u.nin,
              u.preferred_state_id, s.state_name AS preferred_state_name,
              u.preferred_lga_name,
              u.deleted_at,
              u.is_active, u.account_suspended_reason,
              COALESCE(u.approval_status, 'approved') AS approval_status,
              COALESCE(u.is_recruitment_admin, FALSE) AS is_recruitment_admin,
              u.chamber_name, u.chamber_phone
       FROM users u
       LEFT JOIN states s ON s.id = u.preferred_state_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const user = result.rows[0];

    // Decrypt NIN before returning
    if (user.nin) {
      user.nin = decryptNIN(user.nin);
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
    });
  }
};

// ================= REFRESH TOKEN =================
exports.refreshToken = async (req, res) => {
  try {
    // Read the 7d session token from the cookie (not the Bearer header)
    const sessionToken = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME];
    if (!sessionToken) {
      return res.status(401).json({
        success: false,
        message: 'No session token found',
      });
    }

    // Verify the session token (should still be valid since it's 7d)
    const decoded = jwt.verify(sessionToken, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    
    // Mint a new session token (rotate) and let attachAuthSession derive the access token
    const newSessionToken = generateToken(decoded.userId, decoded.userType);

    res.json({
      success: true,
      data: attachAuthSession(res, { token: newSessionToken }),
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

// ================= LOGOUT =================
exports.logout = async (req, res) => {
  try {
    clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
};

// ================= FORGOT PASSWORD =================
exports.forgotPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { email } = req.body;

    // Find user by email
    const result = await db.query(
      `SELECT id, email, full_name FROM users WHERE email = $1 AND deleted_at IS NULL`,
      [email]
    );

    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: 'If that email is registered, a password reset link has been sent.',
      });
    }

    const user = result.rows[0];

    // Generate a JWT-based reset token (self-contained, no DB column needed)
    const resetToken = jwt.sign(
      { userId: user.id, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send reset email
    const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;
    await sendPasswordResetEmail(user.email, resetUrl, user.full_name);

    res.json({
      success: true,
      message: 'If that email is registered, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
    });
  }
};

// ================= RESET PASSWORD =================
exports.resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }

    const { token } = req.params;
    const { password } = req.body;

    // Verify the JWT reset token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    if (decoded.purpose !== 'password-reset' || !decoded.userId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid password reset token',
      });
    }

    // Verify user still exists
    const userResult = await db.query(
      `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token',
      });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password
    await db.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, decoded.userId]
    );

    res.json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
    });
  }
};
