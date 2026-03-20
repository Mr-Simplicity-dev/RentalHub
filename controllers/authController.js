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
  validateNIN,
  verifyNINWithNIMC,
  validateInternationalPassport,
  verifyInternationalPassportWithAPI
} = require('../config/utils/ninValidator');
const {
  sendVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendLawyerInviteEmail
} = require('../config/utils/emailService');
const { sendVerificationCode } = require('../config/utils/smsService');

// Store OTP codes temporarily (use Redis in production)
const otpStore = new Map();
let identitySchemaReady = false;
let lawyerInviteSchemaReady = false;
let tenantRegistrationPaymentSchemaReady = false;

const LAWYER_INVITE_EXPIRY_HOURS = 72;
const LAWYER_INVITE_EXPIRY_MS = LAWYER_INVITE_EXPIRY_HOURS * 60 * 60 * 1000;
const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const TENANT_REGISTRATION_FEE_NGN = 2500;
const LANDLORD_REGISTRATION_FEE_NGN = 5000;
const FRONTEND_URL = getFrontendUrl();
const REGISTRATION_PRICING_TARGETS = {
  tenant: 'tenant_registration',
  landlord: 'landlord_registration',
};

const hashInviteToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex');

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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_international_passport_number
    ON users(international_passport_number)
    WHERE international_passport_number IS NOT NULL;
  `);

  identitySchemaReady = true;
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

  await db.query(`
    CREATE TABLE IF NOT EXISTS tenant_registration_payments (
      id SERIAL PRIMARY KEY,
      user_type VARCHAR(20) NOT NULL DEFAULT 'tenant',
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL DEFAULT 2500,
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
          'landlord_listing',
          'rent_payment',
          'property_unlock',
          'general_platform_fee'
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

// Generate JWT Token
const generateToken = (userId, userType) => {
  return jwt.sign(
    { userId, userType },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
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
    duplicateConditions.push(`nin = $${paramIndex++}`);
    duplicateParams.push(cleanNIN);
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
    nationality
  } = payload;

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').replace(/\s+/g, '');
  const cleanFullName = String(full_name || '').trim();
  const cleanLawyerEmail = lawyer_email
    ? String(lawyer_email).trim().toLowerCase()
    : '';

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
        const nimcResult = await verifyNINWithNIMC(
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
          const error = new Error('NIMC verification is required but not configured on the server');
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

      const passportResult = await verifyInternationalPassportWithAPI(
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
      user_type,
      cleanNIN,
      ninVerified,
      identityType,
      cleanPassportNumber,
      cleanNationality
    },
    plainPassword: password,
    verificationMeta
  };
};

const createUserFromPreparedRegistration = async ({
  preparedRegistration,
  passwordHash,
  verificationMeta,
  tenantRegistrationPayment
}) => {
  await ensureTenantRegistrationPaymentSchema();

  const client = await db.connect();

  try {
    await client.query('BEGIN');

    await assertUniqueUserFields(client, {
      email: preparedRegistration.email,
      phone: preparedRegistration.phone,
      cleanNIN: preparedRegistration.cleanNIN,
      cleanPassportNumber: preparedRegistration.cleanPassportNumber
    });

    const result = await client.query(
      `INSERT INTO users (
         user_type,
         email,
         phone,
         password_hash,
         full_name,
         nin,
         nin_verified,
         identity_document_type,
         international_passport_number,
         nationality
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, email, full_name, user_type, created_at,
                 identity_document_type, nin_verified, nationality`,
      [
        preparedRegistration.user_type,
        preparedRegistration.email,
        preparedRegistration.phone,
        passwordHash,
        preparedRegistration.full_name,
        preparedRegistration.cleanNIN,
        preparedRegistration.ninVerified,
        preparedRegistration.identityType,
        preparedRegistration.cleanPassportNumber,
        preparedRegistration.cleanNationality
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
          tenantRegistrationPayment.amount,
          tenantRegistrationPayment.currency,
          tenantRegistrationPayment.payment_method,
          tenantRegistrationPayment.transaction_reference,
          tenantRegistrationPayment.gateway_response,
          tenantRegistrationPayment.completed_at || new Date()
        ]
      );
    }

    await client.query('COMMIT');

    let lawyerInvite = null;

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
        nationality: newUser.nationality
      },
      token,
      verification: verificationMeta,
      lawyer_invite: lawyerInvite
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
      preparedRegistration,
      passwordHash,
      verificationMeta
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your email and phone.',
      data
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Registration failed',
      error: error.message
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
        preparedRegistration.user_type,
        preparedRegistration.email,
        preparedRegistration.phone,
        preparedRegistration.full_name,
        registrationPricing.amount,
        reference,
        JSON.stringify({
          ...preparedRegistration,
          state_id: registrationPricing.location?.state_id || null,
          lga_name: registrationPricing.location?.lga_name || null,
          password_hash: passwordHash
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
        base_amount: registrationPricing.base_amount,
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
      user_type:
        tenantRegistrationPayment.user_type ||
        storedPayload.user_type,
      cleanNIN: storedPayload.cleanNIN || null,
      ninVerified: storedPayload.ninVerified === true,
      identityType: storedPayload.identityType || null,
      cleanPassportNumber: storedPayload.cleanPassportNumber || null,
      cleanNationality: storedPayload.cleanNationality || 'Nigeria'
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
      data
    });
  } catch (error) {
    console.error('Registration completion error:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to complete registration'
    });
  }
};

// LOGIN
exports.login = async (req, res) => {
  try {
    await ensureIdentitySchema();

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
      `SELECT id, email, password_hash, full_name, user_type, 
              email_verified, phone_verified, identity_verified,
              identity_verification_status, passport_photo_url,
              subscription_active, subscription_expires_at,
              identity_document_type, international_passport_number,
              nationality, nin_verified
       FROM users WHERE email = $1`,
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

    // Generate token
    const token = generateToken(user.id, user.user_type);

    // Remove password from response
    delete user.password_hash;

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

exports.getRegistrationFlags = async (req, res) => {
  try {
    const flags = await getFeatureFlagsMap();
    const userType = String(req.query.user_type || '').trim();
    let pricing = null;

    if (['tenant', 'landlord'].includes(userType)) {
      pricing = await buildRegistrationPricingQuote({
        userType,
        flags,
        stateId: req.query.state_id,
        lgaName: req.query.lga_name,
        strictLocation: false,
      });
    }

    res.json({
      success: true,
      data: {
        allow_registration: flags.allow_registration !== false,
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

    const { token, full_name, phone, password } = req.body;
    const inviteToken = String(token || '').trim();
    const cleanPhone = String(phone || '').replace(/\s+/g, '');
    const cleanFullName = String(full_name || '').trim();
    const tokenHash = hashInviteToken(inviteToken);

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
             updated_at = NOW()
         WHERE id = $4`,
        [cleanFullName, cleanPhone, password_hash, existingUser.id]
      );

      lawyerUserId = existingUser.id;
    } else {
      const lawyerInsert = await db.query(
        `INSERT INTO users
         (user_type, email, phone, password_hash, full_name, identity_document_type, nationality, email_verified)
         VALUES ('lawyer', $1, $2, $3, $4, 'nin', 'Nigeria', TRUE)
         RETURNING id`,
        [invite.lawyer_email, cleanPhone, password_hash, cleanFullName]
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

    const lawyerResult = await db.query(
      `SELECT id, email, full_name, user_type, email_verified, phone_verified, created_at
       FROM users
       WHERE id = $1`,
      [lawyerUserId]
    );

    const user = lawyerResult.rows[0];
    const authToken = generateToken(user.id, user.user_type);

    return res.json({
      success: true,
      message: 'Lawyer invite accepted successfully',
      data: {
        user,
        token: authToken
      }
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
         lawyer.full_name AS lawyer_name
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

// VERIFY EMAIL
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
    otpStore.set(userId, {
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
    const storedOTP = otpStore.get(userId);

    if (!storedOTP) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found. Please request a new one.'
      });
    }

    // Check expiry
    if (Date.now() > storedOTP.expiresAt) {
      otpStore.delete(userId);
      return res.status(400).json({
        success: false,
        message: 'OTP expired. Please request a new one.'
      });
    }

    // Verify OTP
    if (parseInt(otp) !== storedOTP.code) {
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
    otpStore.delete(userId);

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
           identity_verification_status = CASE
             WHEN (
               CASE
                 WHEN COALESCE(identity_document_type, 'nin') = 'passport'
                 THEN international_passport_number IS NOT NULL
                 ELSE nin IS NOT NULL
               END
             ) THEN 'pending'
             ELSE NULL
           END
       WHERE id = $2`,
      [req.file.path, userId]
    );

    // Check if user is now fully verified (email + phone + passport)
    const result = await db.query(
      `SELECT email_verified, phone_verified, passport_photo_url, nin, nin_verified,
              identity_document_type, international_passport_number
       FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    const nimcRequired = process.env.REQUIRE_NIMC_VERIFICATION === 'true';
    const hasIdentityNumber =
      user.identity_document_type === 'passport'
        ? !!user.international_passport_number
        : !!user.nin;
    const ninCheckPassed =
      user.identity_document_type !== 'nin' ||
      !nimcRequired ||
      user.nin_verified;

    // If all verification steps completed, mark for admin review
    if (
      user.email_verified &&
      user.phone_verified &&
      user.passport_photo_url &&
      hasIdentityNumber &&
      ninCheckPassed
    ) {
      // In production, trigger admin notification for manual verification
      res.json({
        success: true,
        message: 'Passport uploaded! Your identity is pending admin verification.',
        passport_url: req.file.path
      });
    } else {
      res.json({
        success: true,
        message: 'Passport uploaded successfully',
        passport_url: req.file.path
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to upload passport photo'
    });
  }
};

// GET CURRENT USER
exports.getCurrentUser = async (req, res) => {
  try {
    await ensureIdentitySchema();

    const userId = req.user.id;

    const result = await db.query(
      `SELECT id, user_type, email, phone, full_name, nin,
              identity_document_type, international_passport_number, nationality, nin_verified,
              passport_photo_url, email_verified, phone_verified,
              identity_verified, identity_verification_status, subscription_active,
              subscription_expires_at, created_at
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
    console.error('GET /auth/me ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
      error: error.message
    });
  }
};


// REFRESH TOKEN
exports.refreshToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const newToken = generateToken(decoded.userId, decoded.userType);

    res.json({
      success: true,
      token: newToken
    });

  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// LOGOUT
exports.logout = async (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // For enhanced security, implement token blacklisting with Redis
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
};

// FORGOT PASSWORD
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await db.query(
      'SELECT id, email FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If email exists, password reset link has been sent'
      });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, email: user.email, purpose: 'password-reset' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const resetUrl = `${FRONTEND_URL}/reset-password/${resetToken}`;

    // Send password reset email
    await sendPasswordResetEmail(email, resetUrl);

    res.json({
      success: true,
      message: 'Password reset link sent to your email'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset'
    });
  }
};

// RESET PASSWORD
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.purpose !== 'password-reset') {
      return res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [password_hash, decoded.userId]
    );

    res.json({
      success: true,
      message: 'Password reset successful'
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Invalid or expired reset token'
    });
  }
};
