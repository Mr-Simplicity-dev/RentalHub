const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;

const {
  authenticate,
  requireSuperAdmin,
  requireNotImpersonating,
} = require('../config/middleware/auth');
const {
  staffVerificationLookupLimiter,
  staffChallengeCreateLimiter,
  staffChallengePollLimiter,
  staffImpersonationReportLimiter,
} = require('../config/middleware/securityRateLimiters');
const defaultService = require('../services/staffIdentityService');
const logger = require('../config/utils/logger');

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTO_BYTES = 3 * 1024 * 1024; // 3 MB strict limit
const STAFF_PHOTO_DIR = path.resolve(__dirname, '..', 'uploads', 'staff-photos');

const hasValidImageMagicBytes = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  return false;
};

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMES.has(String(file.mimetype || '').toLowerCase())) {
      return cb(new Error('Only JPEG, PNG, and WebP photographs are allowed.'));
    }
    return cb(null, true);
  },
});

const getClientIp = (req) => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
};

const storeProcessedStaffPhoto = async (buffer, identityId) => {
  const processed = await sharp(buffer, { limitInputPixels: 16000000, failOn: 'error' })
    .rotate()
    .resize({ width: 800, height: 800, fit: 'cover', position: 'attention' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();

  const hasCloudinary = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );

  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'rental_platform/staff_photos',
          public_id: `staff_${identityId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          resource_type: 'image',
          format: 'jpg',
        },
        (err, result) => {
          if (err) return reject(err);
          return resolve(result);
        }
      );
      stream.end(processed);
    });
    if (uploaded?.secure_url) return uploaded.secure_url;
  }

  await fs.promises.mkdir(STAFF_PHOTO_DIR, { recursive: true });
  const filename = `staff_${Number(identityId)}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.jpg`;
  const targetPath = path.resolve(STAFF_PHOTO_DIR, filename);
  if (!targetPath.startsWith(STAFF_PHOTO_DIR + path.sep)) {
    throw new Error('Invalid destination path.');
  }
  await fs.promises.writeFile(targetPath, processed);
  return `/uploads/staff-photos/${filename}`;
};

const handleRouteError = (res, err) => {
  if (err && err.name === 'StaffVerificationError') {
    return res.status(err.status || 400).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.extra || {}),
    });
  }
  logger.error('Staff verification route error:', err?.message || err);
  return res.status(500).json({
    success: false,
    message: 'Unable to process verification request right now. Please try again shortly.',
  });
};

function createStaffVerificationRouter(deps = {}) {
  const router = express.Router();
  const service = deps.service || defaultService;
  const authMiddleware = deps.authenticate || authenticate;
  const superAdminMiddleware = deps.requireSuperAdmin || requireSuperAdmin;
  const notImpersonatingMiddleware = deps.requireNotImpersonating || requireNotImpersonating;
  const lookupLimiter = deps.lookupLimiter || staffVerificationLookupLimiter;
  const challengeCreateLimiter = deps.challengeCreateLimiter || staffChallengeCreateLimiter;
  const challengePollLimiter = deps.challengePollLimiter || staffChallengePollLimiter;
  const impersonationLimiter = deps.impersonationLimiter || staffImpersonationReportLimiter;
  const savePhoto = deps.storeProcessedStaffPhoto || storeProcessedStaffPhoto;

  // ---------------- PUBLIC ENDPOINTS (NO AUTH REQUIRED) ----------------

  router.get('/public/meta', (_req, res) => {
    res.json({
      success: true,
      data: {
        payment_safety_notice: service.PAYMENT_SAFETY_NOTICE,
        face_match_advisory: service.FACE_MATCH_ADVISORY,
        impersonation_categories: service.IMPERSONATION_CATEGORIES,
        verification_states: service.VERIFICATION_STATES,
      },
    });
  });

  router.get('/public/lookup/:staffId', lookupLimiter, async (req, res) => {
    try {
      const data = await service.lookupPublicStaff(req.params.staffId, {
        ip: getClientIp(req),
      });
      return res.json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  router.post('/public/lookup', lookupLimiter, async (req, res) => {
    try {
      const staffId = req.body?.staff_id || req.body?.qr_payload || req.body?.query || '';
      const data = await service.lookupPublicStaff(staffId, {
        ip: getClientIp(req),
      });
      return res.json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  router.post('/public/challenges', challengeCreateLimiter, async (req, res) => {
    try {
      const data = await service.createLiveChallenge({
        staffIdInput: req.body?.staff_verification_id || req.body?.staff_id || '',
        purpose: req.body?.purpose || '',
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || null,
      });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  router.get('/public/challenges/:challengeReference', challengePollLimiter, async (req, res) => {
    try {
      const pollToken =
        req.headers['x-challenge-poll-token'] ||
        req.query?.poll_token ||
        '';
      const data = await service.getPublicChallengeStatus({
        challengeReference: req.params.challengeReference,
        pollToken: String(pollToken),
      });
      return res.json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  router.post('/public/impersonation-reports', impersonationLimiter, async (req, res) => {
    try {
      const data = await service.createImpersonationReport({
        reportedStaffId: req.body?.reported_staff_id || '',
        challengeReference: req.body?.challenge_reference || '',
        category: req.body?.category || '',
        description: req.body?.description || '',
        incidentLocation: req.body?.incident_location || '',
        reporterName: req.body?.reporter_name || '',
        reporterContact: req.body?.reporter_contact || '',
        ip: getClientIp(req),
      });
      return res.status(201).json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  // ---------------- AUTHENTICATED STAFF ENDPOINTS ----------------

  router.get('/me', authMiddleware, async (req, res) => {
    try {
      const data = await service.getMyStaffIdentity(req.user.id);
      return res.json({ success: true, data });
    } catch (err) {
      return handleRouteError(res, err);
    }
  });

  router.post(
    '/me/challenges/lookup',
    authMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const input = req.body?.code || req.body?.qr_payload || '';
        const data = await service.lookupMyChallengeByCode({
          userId: req.user.id,
          input,
        });
        return res.json({ success: true, data });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.post(
    '/me/challenges/:challengeReference/respond',
    authMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const data = await service.respondToChallenge({
          userId: req.user.id,
          challengeReference: req.params.challengeReference,
          decision: req.body?.decision,
          note: req.body?.note || '',
          ip: getClientIp(req),
        });
        return res.json({ success: true, data });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  // ---------------- SUPER-ADMIN MANAGEMENT ENDPOINTS ----------------

  router.get(
    '/admin/catalog',
    authMiddleware,
    superAdminMiddleware,
    (_req, res) => {
      res.json({
        success: true,
        data: {
          engagement_types: service.ENGAGEMENT_TYPES,
          approved_activity_catalog: service.APPROVED_ACTIVITY_CATALOG,
          eligible_user_types: service.ELIGIBLE_STAFF_USER_TYPES,
          impersonation_categories: service.IMPERSONATION_CATEGORIES,
        },
      });
    }
  );

  router.get(
    '/admin/eligible-users',
    authMiddleware,
    superAdminMiddleware,
    async (req, res) => {
      try {
        const users = await service.searchEligibleUsers({
          search: req.query?.search || '',
          limit: req.query?.limit,
        });
        return res.json({ success: true, data: users });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.get(
    '/admin/identities',
    authMiddleware,
    superAdminMiddleware,
    async (req, res) => {
      try {
        const identities = await service.listStaffIdentities({
          status: req.query?.status || '',
          search: req.query?.search || '',
          limit: req.query?.limit,
          offset: req.query?.offset,
        });
        return res.json({ success: true, data: identities });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.post(
    '/admin/identities',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const created = await service.createStaffIdentity({
          userId: req.body?.user_id,
          fullName: req.body?.full_name,
          officialRole: req.body?.official_role,
          department: req.body?.department,
          engagementType: req.body?.engagement_type,
          approvedActivities: req.body?.approved_activities,
          financialCollectionAuthorized: req.body?.financial_collection_authorized,
          validFrom: req.body?.valid_from,
          expiresAt: req.body?.expires_at,
          officialPhotoUrl: req.body?.official_photo_url,
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.status(201).json({ success: true, data: created });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.patch(
    '/admin/identities/:id',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const updated = await service.updateStaffIdentity({
          identityId: req.params.id,
          updates: req.body || {},
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.json({ success: true, data: updated });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.post(
    '/admin/identities/:id/photo',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    (req, res, next) => {
      photoUpload.single('photo')(req, res, (err) => {
        if (err) {
          return res.status(400).json({
            success: false,
            message:
              err.code === 'LIMIT_FILE_SIZE'
                ? 'Photograph exceeds the 3 MB maximum size limit.'
                : err.message || 'Invalid photograph upload.',
          });
        }
        return next();
      });
    },
    async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({
            success: false,
            message: 'Please attach a JPEG, PNG, or WebP photograph.',
          });
        }
        if (!hasValidImageMagicBytes(req.file.buffer)) {
          return res.status(400).json({
            success: false,
            message: 'Uploaded file signature does not match a valid JPEG, PNG, or WebP image.',
          });
        }
        const photoUrl = await savePhoto(req.file.buffer, req.params.id);
        const updated = await service.updateStaffIdentity({
          identityId: req.params.id,
          updates: { official_photo_url: photoUrl },
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.json({ success: true, data: updated });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.post(
    '/admin/identities/:id/status',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const updated = await service.setStaffIdentityStatus({
          identityId: req.params.id,
          action: req.body?.action,
          reason: req.body?.reason || '',
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.json({ success: true, data: updated });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.post(
    '/admin/identities/:id/regenerate-id',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const updated = await service.regenerateStaffVerificationId({
          identityId: req.params.id,
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.json({ success: true, data: updated });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.get(
    '/admin/history',
    authMiddleware,
    superAdminMiddleware,
    async (req, res) => {
      try {
        const data = await service.getAdminVerificationHistory({
          limit: req.query?.limit,
        });
        return res.json({ success: true, data });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.get(
    '/admin/impersonation-reports',
    authMiddleware,
    superAdminMiddleware,
    async (req, res) => {
      try {
        const reports = await service.listImpersonationReports({
          status: req.query?.status || '',
          limit: req.query?.limit,
        });
        return res.json({ success: true, data: reports });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  router.patch(
    '/admin/impersonation-reports/:id',
    authMiddleware,
    superAdminMiddleware,
    notImpersonatingMiddleware,
    async (req, res) => {
      try {
        const updated = await service.updateImpersonationReport({
          reportId: req.params.id,
          status: req.body?.status,
          investigationNotes: req.body?.investigation_notes || '',
          actorUser: req.user,
          ip: getClientIp(req),
        });
        return res.json({ success: true, data: updated });
      } catch (err) {
        return handleRouteError(res, err);
      }
    }
  );

  return router;
}

const defaultRouter = createStaffVerificationRouter();
defaultRouter.createStaffVerificationRouter = createStaffVerificationRouter;
defaultRouter.hasValidImageMagicBytes = hasValidImageMagicBytes;

module.exports = defaultRouter;
