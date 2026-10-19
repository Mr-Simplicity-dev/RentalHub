const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { body, param } = require('express-validator');
const router = express.Router();
const waCtrl = require('../controllers/whatsappMarketingController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const { requireSuperAdmin } = waCtrl;

const MEDIA_DIR = path.join(__dirname, '..', 'uploads', 'whatsapp-campaigns');
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// WhatsApp accepts images up to 5MB and videos up to 16MB, fetched by Meta
// from a public https URL — these uploads are served statically and publicly.
const ALLOWED_MEDIA = {
  'image/jpeg': { ext: '.jpg', type: 'image', max: 5 * 1024 * 1024 },
  'image/png': { ext: '.png', type: 'image', max: 5 * 1024 * 1024 },
  'image/webp': { ext: '.webp', type: 'image', max: 5 * 1024 * 1024 },
  'video/mp4': { ext: '.mp4', type: 'video', max: 16 * 1024 * 1024 },
  'video/3gpp': { ext: '.3gp', type: 'video', max: 16 * 1024 * 1024 },
};

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEDIA_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MEDIA[file.mimetype]?.ext || path.extname(file.originalname) || '.bin';
    cb(null, `wa_${Date.now()}_${crypto.randomBytes(12).toString('hex')}${ext}`);
  },
});

const uploadMedia = multer({
  storage: mediaStorage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MEDIA[file.mimetype]) return cb(null, true);
    cb(new Error('Only JPG, PNG, WEBP images or MP4/3GP videos are allowed'));
  },
});

const uploadCampaignMedia = (req, res) => {
  uploadMedia.single('file')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (images max 5MB, videos max 16MB)'
        : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const rule = ALLOWED_MEDIA[req.file.mimetype];
    if (req.file.size > rule.max) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.status(400).json({ success: false, message: 'Images must be under 5MB and videos under 16MB' });
    }
    const url = `${req.protocol}://${req.get('host')}/uploads/whatsapp-campaigns/${req.file.filename}`;
    return res.status(201).json({ success: true, data: { url, media_type: rule.type, size: req.file.size } });
  });
};

router.get('/stats', authenticate, requireSuperAdmin, waCtrl.getDashboardStats);

router.get('/audience', authenticate, requireSuperAdmin, waCtrl.getAudienceEstimate);

router.post('/media', authenticate, requireSuperAdmin, uploadCampaignMedia);

router.get('/campaigns', authenticate, requireSuperAdmin, waCtrl.listCampaigns);
router.post(
  '/campaigns',
  [
    body('name').isString().trim().isLength({ min: 1, max: 200 }),
    body('kind').isIn(['template', 'text']),
    body('template_name').optional().isString().trim().isLength({ max: 128 }),
    body('template_language').optional().isString().trim().isLength({ max: 20 }),
    body('content').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
    body('media_type').optional({ values: 'null' }).isString().trim().isLength({ max: 20 }),
    body('media_url').optional({ values: 'null' }).isString().trim().isLength({ max: 2000 }),
    body('header_media_type').optional({ values: 'null' }).isString().trim().isLength({ max: 20 }),
    body('header_media_url').optional({ values: 'null' }).isString().trim().isLength({ max: 2000 }),
  ],
  validateRequest,
  authenticate,
  requireSuperAdmin,
  waCtrl.createCampaign
);
router.get('/campaigns/:id/stats', authenticate, requireSuperAdmin, waCtrl.getCampaignStats);
router.post('/campaigns/:id/send', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.sendCampaign);
router.post('/campaigns/:id/retry', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.retryCampaign);
router.delete('/campaigns/:id', [param('id').isInt()], validateRequest, authenticate, requireSuperAdmin, waCtrl.deleteCampaign);

module.exports = router;
