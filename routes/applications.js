const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const applicationController = require('../controllers/applicationController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../middleware/auth');

// ============ TENANT ROUTES ============

// Submit application for a property
router.post('/',
  authenticate,
  isTenant,
  isVerified,
  [
    body('property_id').isInt(),
    body('message').optional().trim(),
    body('move_in_date').optional().isDate()
  ],
  applicationController.submitApplication
);

// Get tenant's applications
router.get('/my-applications',
  authenticate,
  isTenant,
  applicationController.getMyApplications
);

// Get specific application details
router.get('/:applicationId',
  authenticate,
  applicationController.getApplicationById
);

// Withdraw application
router.patch('/:applicationId/withdraw',
  authenticate,
  isTenant,
  applicationController.withdrawApplication
);

// ============ LANDLORD ROUTES ============

// Get applications for landlord's properties
router.get('/landlord/received',
  authenticate,
  isLandlord,
  applicationController.getReceivedApplications
);

// Get applications for specific property
router.get('/property/:propertyId',
  authenticate,
  isLandlord,
  applicationController.getPropertyApplications
);

// Approve application
router.patch('/:applicationId/approve',
  authenticate,
  isLandlord,
  applicationController.approveApplication
);

// Reject application
router.patch('/:applicationId/reject',
  authenticate,
  isLandlord,
  [body('reason').optional().trim()],
  applicationController.rejectApplication
);

// Get application statistics
router.get('/landlord/stats',
  authenticate,
  isLandlord,
  applicationController.getApplicationStats
);

module.exports = router;