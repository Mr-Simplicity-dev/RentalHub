const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const propertyController = require('../controllers/propertyController');
const {
  authenticate,
  optionalAuthenticate,
  isLandlordOrAgent,
  isTenant,
} = require('../config/middleware/auth');
const audit = require('../config/middleware/auditMiddleware');
const { uploadPropertyMedia, uploadPropertyPhotos } = require('../config/middleware/upload');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ownershipUploadDir = path.join(__dirname, '..', 'uploads', 'ownership');
if (!fs.existsSync(ownershipUploadDir)) {
  fs.mkdirSync(ownershipUploadDir, { recursive: true });
}

const ownershipDocStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ownershipUploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `ownership_${req.user ? req.user.id : 'anon'}_${Date.now()}${ext}`);
  },
});

const uploadOwnershipDoc = multer({
  storage: ownershipDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image\/|application\/pdf)/.test(file.mimetype || '');
    cb(ok ? null : new Error('Only images or PDF documents are allowed'), ok);
  },
}).single('document');

// ============ PUBLIC ROUTES ============

// Get all states
router.get('/states', propertyController.getAllStates);

// Browse properties (limited info for non-subscribers)
router.get('/browse', optionalAuthenticate, propertyController.browseProperties);

// Get featured properties
router.get('/featured', optionalAuthenticate, propertyController.getFeaturedProperties);

// Search properties with filters
router.get('/search', optionalAuthenticate, propertyController.searchProperties);

// ============ TENANT ROUTES ============

// Get saved properties
router.get(
  '/user/saved',
  authenticate,
  isTenant,
  propertyController.getSavedProperties
);

// Get properties the tenant has applied for
router.get(
  '/tenant',
  authenticate,
  isTenant,
  propertyController.getTenantProperties
);

// Get full property details (requires active subscription)
router.get(
  '/:propertyId/details',
  authenticate,
  isTenant,
  propertyController.getFullPropertyDetails
);

// Save/favorite property
router.post(
  '/:propertyId/save',
  authenticate,
  isTenant,
  propertyController.saveProperty
);

// Unsave property
router.delete(
  '/:propertyId/save',
  authenticate,
  isTenant,
  propertyController.unsaveProperty
);

// Add review
router.post(
  '/:propertyId/review',
  authenticate,
  isTenant,
  [
    body('rating').isInt({ min: 1, max: 5 }),
    body('review_text').optional().trim().customSanitizer(v => v ? v.replace(/<[^>]*>/g, '') : v).isLength({ max: 10000 }),
  ],
  propertyController.addReview
);

// Get property users for dispute creation
router.get(
  '/:propertyId/users',
  authenticate,
  propertyController.getPropertyUsers
);

// Get property reviews
router.get('/:propertyId/reviews', propertyController.getPropertyReviews);

// ============ LANDLORD ROUTES ============

router.post(
  '/damage-analysis',
  authenticate,
  isLandlordOrAgent,
  uploadPropertyPhotos,
  propertyController.analyzeDamagePhoto
);

// Get landlord's properties
router.get(
  '/landlord/my-properties',
  authenticate,
  isLandlordOrAgent,
  propertyController.getMyProperties
);

router.post(
  '/live-capture/session',
  authenticate,
  isLandlordOrAgent,
  propertyController.createPropertyImageCaptureSession
);

// Create new property (with media)
router.post(
  '/',
  authenticate,
  isLandlordOrAgent,
  uploadPropertyMedia,
  [
    body('state_id').optional().isInt(),
    body('state').optional().trim().notEmpty(),
    body('lga_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 120 }),
    body().custom((_, { req }) => {
      if (req.body.state_id || req.body.state) return true;
      throw new Error('state_id or state is required');
    }),
    body('city').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('full_address').optional().trim().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Valid latitude is required'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Valid longitude is required'),
    body('property_type').isIn([
      'apartment',
      'house',
      'duplex',
      'studio',
      'bungalow',
      'flat',
      'room',
    ]),
    body('bedrooms').isInt({ min: 0 }),
    body('bathrooms').isInt({ min: 0 }),
    body('rent_amount').isFloat({ min: 0 }),
    body('payment_frequency').isIn(['monthly', 'yearly']),
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty(),
    validateRequest,
  ],
  propertyController.createProperty
);

// Upload property photos (legacy / optional)
router.post(
  '/:propertyId/photos',
  authenticate,
  isLandlordOrAgent,
  uploadPropertyPhotos,
  propertyController.uploadPropertyPhotos
);

// Update property
router.put(
  '/:propertyId',
  authenticate,
  isLandlordOrAgent,
  [
    body('state_id').optional().isInt(),
    body('lga_name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 120 }),
    body('city').optional({ checkFalsy: true }).trim().notEmpty(),
    body('area').optional({ checkFalsy: true }).trim().notEmpty(),
    body('full_address').optional({ checkFalsy: true }).trim().notEmpty(),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('property_type').optional().isIn([
      'apartment', 'house', 'duplex', 'studio', 'bungalow', 'flat', 'room',
    ]),
    body('bedrooms').optional().isInt({ min: 0 }),
    body('bathrooms').optional().isInt({ min: 0 }),
    body('rent_amount').optional().isFloat({ min: 0 }),
    body('payment_frequency').optional().isIn(['monthly', 'yearly']),
    body('caution_deposit').optional().isFloat({ min: 0 }),
    body('title').optional({ checkFalsy: true }).trim().notEmpty(),
    body('description').optional({ checkFalsy: true }).trim().notEmpty(),
    body('amenities').optional().isArray(),
    validateRequest,
  ],
  propertyController.updateProperty
);

// Delete property
router.delete(
  '/:propertyId',
  authenticate,
  isLandlordOrAgent,
  propertyController.deleteProperty
);

// Toggle property availability
router.patch(
  '/:propertyId/availability',
  authenticate,
  isLandlordOrAgent,
  propertyController.toggleAvailability
);

router.patch(
  '/:id/unlist',
  authenticate,
  isLandlordOrAgent,
  audit('unlist_property', 'property'),
  propertyController.unlistProperty
);

// Delete property photo
router.delete(
  '/:propertyId/photos/:photoId',
  authenticate,
  isLandlordOrAgent,
  propertyController.deletePropertyPhoto
);

// Get property statistics (for landlord)
router.get(
  '/:propertyId/stats',
  authenticate,
  isLandlordOrAgent,
  propertyController.getPropertyStats
);

// ============ DAMAGE REPORTS ============

// Save damage report with photos (landlord, on property creation or edit)
router.post(
  '/:propertyId/damage-report',
  authenticate,
  isLandlordOrAgent,
  uploadPropertyPhotos,
  propertyController.saveDamageReport
);

// Get all damage reports for a property (landlord + tenant)
router.get(
  '/:propertyId/damage-reports',
  authenticate,
  propertyController.getDamageReports
);

// Property ownership document upload (landlord/agent). Stored locally; the URL
// is saved on the property for super-admin review before ownership verification.
router.post('/:propertyId/ownership-document', authenticate, isLandlordOrAgent, (req, res) => {
  uploadOwnershipDoc(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No document uploaded' });
    }

    // Validate actual file content (magic bytes), not the client-declared MIME
    // type, and reject anything the antivirus scanner flags.
    try {
      const { validateFileMagicBytes } = require('../config/middleware/upload');
      const validMagic = validateFileMagicBytes(req.file.path);
      let infected = false;
      try {
        const { scanFileForMalware } = require('../config/utils/clamav');
        infected = (await scanFileForMalware(req.file.path)).infected === true;
      } catch (_) { /* scanner fail-open */ }

      if (!validMagic || infected) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(400).json({
          success: false,
          message: infected
            ? 'Upload rejected: the file appears to be infected.'
            : 'File content does not match an allowed document type (image or PDF).',
        });
      }
    } catch (_) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({ success: false, message: 'Could not validate the uploaded document.' });
    }

    try {
      const relativePath = `/uploads/ownership/${req.file.filename}`;
      const result = await require('../config/middleware/database').query(
        `UPDATE properties
         SET ownership_document_url = $1,
             ownership_document_uploaded_at = CURRENT_TIMESTAMP,
             ownership_verification_status = 'pending',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND landlord_id = $3
         RETURNING id, ownership_document_url, ownership_verification_status`,
        [relativePath, req.params.propertyId, req.user.id]
      );

      if (!result.rows.length) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(404).json({ success: false, message: 'Property not found or not yours' });
      }

      res.json({ success: true, message: 'Ownership document uploaded for review', data: result.rows[0] });
    } catch (error) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      req.logger.error('Ownership document upload error:', error);
      res.status(500).json({ success: false, message: 'Failed to save ownership document' });
    }
  });
});

// Get property by ID (limited info for non-subscribers) — keep LAST
router.get('/:propertyId', propertyController.getPropertyById);

module.exports = router;
