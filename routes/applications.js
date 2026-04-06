const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const applicationController = require('../controllers/applicationController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../config/middleware/auth');

// Security: Block phone number sharing during negotiation
const phoneNumberRegex = /(\+?[\d-\s()]{7,})|(\d{3}[-.]?\d{3}[-.]?\d{4})|(\d{10})/i;
const noPhoneNumbersValidator = body('note', 'Phone numbers cannot be shared during negotiation')
  .if(body('note').exists({ checkFalsy: false }))
  .custom(value => {
    if (value && typeof value === 'string' && phoneNumberRegex.test(value)) {
      throw new Error('Phone numbers cannot be shared during negotiation. Please use only in-app messaging.');
    }
    return true;
  });

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }
  next();
};

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
  handleValidationErrors,
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
    noPhoneNumbersValidator
  ],
  handleValidationErrors,
  applicationController.tenantUpdateOffer
);

router.patch('/:applicationId/respond-counter',
  authenticate,
  isTenant,
  [
    body('action').isIn(['accept', 'reject']),
    noPhoneNumbersValidator
  ],
  handleValidationErrors,
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
  [noPhoneNumbersValidator],
  handleValidationErrors,
  applicationController.landlordAcceptOffer
);

router.patch('/:applicationId/counter-offer',
  authenticate,
  isLandlord,
  [
    body('counter_offer_rent').isFloat({ gt: 0 }),
    noPhoneNumbersValidator
  ],
  handleValidationErrors,
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