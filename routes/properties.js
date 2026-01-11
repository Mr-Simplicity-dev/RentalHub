const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const propertyController = require('../controllers/propertyController');
const { authenticate, isLandlord, isTenant, isVerified, hasActiveSubscription } = require('../config/middleware/auth');
const { uploadPropertyPhotos } = require('../config/middleware/upload');

// ============ PUBLIC ROUTES ============

// Get all states
router.get('/states', propertyController.getAllStates);

// Browse properties (limited info for non-subscribers)
router.get('/browse', propertyController.browseProperties);

// SAFE: Get featured properties (no DB crash)
router.get('/featured', async (req, res) => {
  const limit = Number(req.query.limit) || 6;

  res.json({
    success: true,
    data: [] // return empty list for now
  });
});

// Search properties with filters
router.get('/search', propertyController.searchProperties);

// ============ TENANT ROUTES ============

// Get saved properties
router.get('/user/saved',
  authenticate,
  isTenant,
  propertyController.getSavedProperties
);

// Get full property details (requires active subscription)
router.get('/:propertyId/details',
  authenticate,
  isTenant,
  hasActiveSubscription,
  propertyController.getFullPropertyDetails
);

// Save/favorite property
router.post('/:propertyId/save',
  authenticate,
  isTenant,
  propertyController.saveProperty
);

// Unsave property
router.delete('/:propertyId/save',
  authenticate,
  isTenant,
  propertyController.unsaveProperty
);

// Add review
router.post('/:propertyId/review',
  authenticate,
  isTenant,
  [
    body('rating').isInt({ min: 1, max: 5 }),
    body('review_text').optional().trim()
  ],
  propertyController.addReview
);

// Get property reviews
router.get('/:propertyId/reviews', propertyController.getPropertyReviews);

// ============ LANDLORD ROUTES ============

// Get landlord's properties
router.get('/landlord/my-properties',
  authenticate,
  isLandlord,
  propertyController.getMyProperties
);

// Create new property
router.post('/',
  authenticate,
  isLandlord,
  isVerified,
  [
    body('state_id').isInt(),
    body('city').trim().notEmpty(),
    body('area').trim().notEmpty(),
    body('full_address').trim().notEmpty(),
    body('property_type').isIn(['apartment', 'house', 'duplex', 'studio', 'bungalow', 'flat', 'room']),
    body('bedrooms').isInt({ min: 0 }),
    body('bathrooms').isInt({ min: 0 }),
    body('rent_amount').isFloat({ min: 0 }),
    body('payment_frequency').isIn(['monthly', 'yearly']),
    body('title').trim().notEmpty(),
    body('description').trim().notEmpty()
  ],
  propertyController.createProperty
);

// Upload property photos
router.post('/:propertyId/photos',
  authenticate,
  isLandlord,
  uploadPropertyPhotos,
  propertyController.uploadPropertyPhotos
);

// Update property
router.put('/:propertyId',
  authenticate,
  isLandlord,
  propertyController.updateProperty
);

// Delete property
router.delete('/:propertyId',
  authenticate,
  isLandlord,
  propertyController.deleteProperty
);

// Toggle property availability
router.patch('/:propertyId/availability',
  authenticate,
  isLandlord,
  propertyController.toggleAvailability
);

// Delete property photo
router.delete('/:propertyId/photos/:photoId',
  authenticate,
  isLandlord,
  propertyController.deletePropertyPhoto
);

// Get property statistics (for landlord)
router.get('/:propertyId/stats',
  authenticate,
  isLandlord,
  propertyController.getPropertyStats
);

// Get property by ID (limited info for non-subscribers) — keep LAST
router.get('/:propertyId', propertyController.getPropertyById);

module.exports = router;
