const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const applicationController = require('../controllers/applicationController');
const { authenticate, isTenant, isLandlord, isVerified } = require('../config/middleware/auth');

const noPhoneNumbersValidator=async(req,res,next)=>{
 try{
 const service=require('../services/contactPolicyService');
 const id=req.params?.applicationId;
 const history=id?(await require('../config/middleware/database').query("SELECT note FROM application_negotiations WHERE application_id=$1 AND actor_user_id=$2 AND created_at>NOW()-INTERVAL '15 minutes' ORDER BY created_at DESC LIMIT 5",[id,req.user.id])).rows.reverse().map(row=>row.note):[];
 await service.enforce({userId:req.user.id,channel:'negotiation',contextKey:id || req.body.property_id || 'new',texts:[req.body.note,req.body.message,req.body.reason,req.body.rejection_reason],history});next();
 }catch(error){if(error.code==='CONTACT_SHARING_BLOCKED')return res.status(400).json({success:false,code:error.code,message:error.message});next(error);}
};

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
  noPhoneNumbersValidator,
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
  noPhoneNumbersValidator,
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
  noPhoneNumbersValidator,
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
  noPhoneNumbersValidator,
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