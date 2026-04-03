const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const propertyController = require('../controllers/propertyController');
const {
  authenticate,
  isLandlordOrAgent,
  isTenant,
} = require('../config/middleware/auth');
const audit = require('../config/middleware/auditMiddleware');
const { uploadPropertyMedia, uploadPropertyPhotos } = require('../config/middleware/upload');

// ============ PUBLIC ROUTES ============

// Get all states
router.get('/states', propertyController.getAllStates);

// Browse properties (limited info for non-subscribers)
router.get('/browse', propertyController.browseProperties);

// Get featured properties
router.get('/featured', propertyController.getFeaturedProperties);

// Search properties with filters
router.get('/search', propertyController.searchProperties);

// ============ TENANT ROUTES ============

// Get saved properties
router.get(
  '/user/saved',
  authenticate,
  isTenant,
  propertyController.getSavedProperties
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
    body('review_text').optional().trim(),
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

// Create new property (with media)
router.post(
  '/',
  authenticate,
  isLandlordOrAgent,
  uploadPropertyMedia,
  [
    body('state_id').optional().isInt(),
    body('state').optional().trim().notEmpty(),
    body().custom((_, { req }) => {
      if (req.body.state_id || req.body.state) return true;
      throw new Error('state_id or state is required');
    }),
    body('city').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('full_address').optional().trim().notEmpty(),
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

// Get property by ID (limited info for non-subscribers) — keep LAST
router.get('/:propertyId', propertyController.getPropertyById);

module.exports = router;
