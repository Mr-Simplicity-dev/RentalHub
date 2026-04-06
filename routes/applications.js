const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const applicationController = require('../controllers/applicationController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../config/middleware/auth');

// ============ TENANT ROUTES ============

// Submit application for a property
router.post('/',
  authenticate,
  isTenant,
  isVerified,
  [
    body('property_id').isInt(),
    body('message').optional().trim(),
    body('move_in_date').optional().isDate(),
    body('proposed_rent').optional({ checkFalsy: true }).isFloat({ gt: 0 })
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

router.patch('/:applicationId/offer',
  authenticate,
  isTenant,
  [
    body('proposed_rent').isFloat({ gt: 0 }),
    body('note').optional().trim()
  ],
  applicationController.tenantUpdateOffer
);

router.patch('/:applicationId/respond-counter',
  authenticate,
  isTenant,
  [
    body('action').isIn(['accept', 'reject']),
    body('note').optional().trim()
  ],
  applicationController.tenantRespondToCounter
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

router.patch('/:applicationId/accept-offer',
  authenticate,
  isLandlord,
  [body('note').optional().trim()],
  applicationController.landlordAcceptOffer
);

router.patch('/:applicationId/counter-offer',
  authenticate,
  isLandlord,
  [
    body('counter_offer_rent').isFloat({ gt: 0 }),
    body('note').optional().trim()
  ],
  applicationController.landlordCounterOffer
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