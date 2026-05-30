const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, query } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const { sensitiveActionLimiter } = require('../config/middleware/securityRateLimiters');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'passports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Only allow safe image extensions
const ALLOWED_PASSPORT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_PASSPORT_EXTENSIONS.has(ext)) {
      return cb(new Error(`Invalid file extension "${ext}". Allowed: ${Array.from(ALLOWED_PASSPORT_EXTENSIONS).join(', ')}`));
    }
    cb(null, `passport_${req.user.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_PASSPORT_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid image file type'));
    }
    cb(null, true);
  }
});

const LIVE_CAPTURE_SESSION_TTL_MS = 10 * 60 * 1000;
const REQUIRE_LIVE_CAPTURE_SESSION = process.env.REQUIRE_LIVE_CAPTURE_SESSION === 'true';
const liveCaptureSessions = new Map();

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

const cleanupUploadedFile = (file) => {
  if (!file?.path) return;
  try {
    fs.unlinkSync(file.path);
  } catch (err) {
    console.warn('Failed to clean up uploaded file:', err.message);
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
    console.error('Commission password status error:', error);
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
    console.error('Commission password setup error:', error);
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
    console.error('Commission password verification error:', error);
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
    console.error('Commission password change error:', error);
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
    console.error('Commission password reset error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset commission password',
    });
  }
});


// Get user profile by ID (public info only)
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

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
  validateRequest,
], async (req, res) => {
  try {
    const userId = req.user.id;
    const { full_name, phone } = req.body;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (full_name) {
      updates.push(`full_name = $${paramCount}`);
      params.push(full_name);
      paramCount++;
    }

    if (phone) {
      updates.push(`phone = $${paramCount}`);
      params.push(phone);
      paramCount++;
      // Reset phone verification if phone changed
      updates.push(`phone_verified = FALSE`);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No updates provided'
      });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(userId);

    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`;

    const result = await db.query(query, params);

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

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const new_password_hash = await bcrypt.hash(new_password, salt);

    // Update password
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
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
    console.error('Create live capture session error:', error);
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
    console.error('Delete account error:', error);
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
    console.error('Password verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify password',
    });
  }
});

// Upload passport photo
router.post('/upload-passport', authenticate, upload.single('passport'), async (req, res) => {
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
           END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [relativePath, userId]
    );

    const userResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, nin,
              identity_document_type, international_passport_number, nationality, nin_verified,
              passport_photo_url, email_verified, phone_verified,
              identity_verified, identity_verification_status, subscription_active,
              subscription_expires_at, created_at
       FROM users WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Passport uploaded successfully',
      url: relativePath,
      user: userResult.rows[0]
    });

  } catch (error) {
    console.error('Upload passport error:', error);
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

    // Only the owner or admins can view
    if (fileOwnerId !== req.user.id && !['admin', 'super_admin', 'state_admin', 'financial_admin'].includes(req.user.user_type)) {
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
    console.error('Serve passport photo error:', error);
    res.status(500).json({ success: false, message: 'Failed to serve file' });
  }
});

module.exports = router;
