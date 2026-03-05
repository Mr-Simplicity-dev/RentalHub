const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../config/middleware/database');
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

const LAWYER_INVITE_EXPIRY_HOURS = 72;
const LAWYER_INVITE_EXPIRY_MS = LAWYER_INVITE_EXPIRY_HOURS * 60 * 60 * 1000;

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
    ADD COLUMN IF NOT EXISTS nationality VARCHAR(80);

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

  const inviteUrl = `${process.env.FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;
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

// REGISTER NEW USER
exports.register = async (req, res) => {
  try {
    await ensureIdentitySchema();

    // Validate input
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

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
    } = req.body;

    const cleanLawyerEmail = lawyer_email
      ? String(lawyer_email).trim().toLowerCase()
      : '';

    if (cleanLawyerEmail && cleanLawyerEmail === String(email).trim().toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: 'Lawyer email must be different from your account email'
      });
    }

    const isForeigner =
      is_foreigner === true ||
      is_foreigner === 'true' ||
      is_foreigner === 1 ||
      is_foreigner === '1';

    const identityType = isForeigner ? 'passport' : 'nin';

    const cleanNIN = nin ? String(nin).trim() : null;
    const testNIN = String(process.env.NIMC_TEST_NIN || '00000000000').trim();
    const allowTestNINBypass =
      process.env.ALLOW_TEST_NIN_BYPASS === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_NIN_BYPASS !== 'false');
    const cleanNationality = nationality
      ? String(nationality).trim()
      : isForeigner
        ? 'Foreign'
        : 'Nigeria';
    const isNigerianNationality = /^nigeria(n)?$/i.test(cleanNationality);
    const passportValidation = validateInternationalPassport(
      international_passport_number
    );
    const cleanPassportNumber =
      identityType === 'passport' && passportValidation.valid
        ? passportValidation.value
        : null;

    let ninVerified = false;
    let nimcMeta = null;

    if (!isForeigner) {
      if (identity_document_type === 'passport') {
        return res.status(400).json({
          success: false,
          message: 'NIN is required for local Nigerian registration'
        });
      }

      const ninValidation = validateNIN(cleanNIN);
      if (!ninValidation.valid) {
        return res.status(400).json({
          success: false,
          message: ninValidation.message
        });
      }

      if (nationality && !isNigerianNationality) {
        return res.status(400).json({
          success: false,
          message: 'Foreign applicants must register with international passport'
        });
      }

      const names = String(full_name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = names[0] || '';
      const lastName = names.slice(1).join(' ') || names[0] || '';

      const isTestNIN = cleanNIN === testNIN;
      if (isTestNIN && allowTestNINBypass) {
        ninVerified = true;
        nimcMeta = {
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

        nimcMeta = {
          status: nimcResult.status,
          message: nimcResult.message
        };

        if (nimcResult.status === 'not_configured') {
          return res.status(503).json({
            success: false,
            message: 'NIMC verification is required but not configured on the server'
          });
        }

        if (nimcResult.status === 'service_error') {
          return res.status(503).json({
            success: false,
            message: nimcResult.message
          });
        }

        if (nimcResult.status === 'not_verified') {
          return res.status(400).json({
            success: false,
            message: nimcResult.message || 'NIN verification failed'
          });
        }

        ninVerified = nimcResult.verified === true;
      }
    } else {
      if (identity_document_type === 'nin') {
        return res.status(400).json({
          success: false,
          message: 'International passport is required for foreign applicants'
        });
      }

      if (!passportValidation.valid) {
        return res.status(400).json({
          success: false,
          message: passportValidation.message
        });
      }

      if (!cleanNationality) {
        return res.status(400).json({
          success: false,
          message: 'Nationality is required for international passport verification'
        });
      }

      if (isNigerianNationality) {
        return res.status(400).json({
          success: false,
          message: 'Nigerian applicants must register with NIN'
        });
      }

      const passportResult = await verifyInternationalPassportWithAPI(
        cleanPassportNumber,
        full_name,
        cleanNationality,
        date_of_birth
      );

      if (passportResult.status === 'not_configured') {
        return res.status(503).json({
          success: false,
          message: 'Passport verification API is required but not configured on the server'
        });
      }

      if (passportResult.status === 'service_error') {
        return res.status(503).json({
          success: false,
          message: passportResult.message
        });
      }

      if (passportResult.status === 'not_verified') {
        return res.status(400).json({
          success: false,
          message: passportResult.message || 'Passport verification failed'
        });
      }
    }

    // Check if user already exists
    const duplicateConditions = ['email = $1', 'phone = $2'];
    const duplicateParams = [email, phone];
    let paramIndex = 3;

    if (identityType === 'nin') {
      duplicateConditions.push(`nin = $${paramIndex++}`);
      duplicateParams.push(cleanNIN);
    } else {
      duplicateConditions.push(`international_passport_number = $${paramIndex++}`);
      duplicateParams.push(cleanPassportNumber);
    }

    const existingUser = await db.query(
      `SELECT id FROM users WHERE ${duplicateConditions.join(' OR ')}`,
      duplicateParams
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: identityType === 'nin'
          ? 'User with this email, phone, or NIN already exists'
          : 'User with this email, phone, or passport number already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insert user into database
    const result = await db.query(
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
        user_type,
        email,
        phone,
        password_hash,
        full_name,
        identityType === 'nin' ? cleanNIN : null,
        ninVerified,
        identityType,
        identityType === 'passport' ? cleanPassportNumber : null,
        cleanNationality
      ]
    );

    const newUser = result.rows[0];
    let lawyerInvite = null;

    if (cleanLawyerEmail) {
      try {
        lawyerInvite = await createLawyerInvite({
          clientUserId: newUser.id,
          lawyerEmail: cleanLawyerEmail,
          clientName: newUser.full_name,
          clientRole: newUser.user_type,
        });
      } catch (inviteError) {
        console.error('Lawyer invite creation error:', inviteError);
      }
    }

    // Generate email verification token
    const verificationToken = jwt.sign(
      { userId: newUser.id, email: newUser.email },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Send verification email
    await sendVerificationEmail(email, verificationToken);
    await sendWelcomeEmail(email, full_name, user_type);

    // Generate auth token
    const token = generateToken(newUser.id, user_type);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your email and phone.',
      data: {
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
        verification: nimcMeta,
        lawyer_invite: lawyerInvite
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
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
    const inviteUrl = `${process.env.FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;

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
    const inviteUrl = `${process.env.FRONTEND_URL}/lawyer/accept-invite?token=${rawToken}`;

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
      'UPDATE users SET passport_photo_url = $1 WHERE id = $2',
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
              identity_verified, subscription_active,
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

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

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
