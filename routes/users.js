const express = require('express');
const router = express.Router();
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'passports');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
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
    ADD COLUMN IF NOT EXISTS nationality VARCHAR(80);
  `);

  identitySchemaReady = true;
};


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
router.put('/profile', authenticate, async (req, res) => {
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
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password required'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters'
      });
    }

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

// Delete account
router.delete('/account', authenticate, async (req, res) => {
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
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password'
      });
    }

    // Delete user (cascade will delete related records)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
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
      'UPDATE users SET passport_photo_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [relativePath, userId]
    );

    const userResult = await db.query(
      `SELECT id, user_type, email, phone, full_name, nin,
              identity_document_type, international_passport_number, nationality, nin_verified,
              passport_photo_url, email_verified, phone_verified,
              identity_verified, subscription_active,
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


module.exports = router;
