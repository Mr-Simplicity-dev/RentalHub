const express = require('express');
const router = express.Router();

const disputeController = require('../controllers/disputeController');

const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const { canAccessProperty } = require('../config/middleware/propertyAccessMiddleware');
const { canAccessDispute } = require('../config/middleware/disputeAccessMiddleware');
const upload = require('../config/middleware/uploadEvidence');
const { param } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const sharedContactGuard=async(req,res,next)=>{try{const history=req.params.disputeId?(await require('../config/middleware/database').query("SELECT message FROM dispute_messages WHERE dispute_id=$1 AND sender_id=$2 AND created_at>NOW()-INTERVAL '15 minutes' ORDER BY created_at DESC LIMIT 5",[req.params.disputeId,req.user.id])).rows.reverse().map(row=>row.message):[];await require('../services/contactPolicyService').enforce({userId:req.user.id,channel:'dispute',contextKey:req.params.disputeId||req.body.property_id||'new',texts:[req.body.message,req.body.title,req.body.description],history});next();}catch(error){if(error.code==='CONTACT_SHARING_BLOCKED')return res.status(400).json({success:false,code:error.code,message:error.message});next(error);}};
router.use((req,res,next)=>{const json=res.json;res.json=function(body){const allowed=['admin','lga_admin','super_admin','super_support_admin','zonal_admin','state_support_admin','lga_support_admin'].includes(req.user?.user_type);return json.call(this,allowed?body:require('../config/utils/propertyContactPrivacy').removePropertyContacts(body));};next();});

/**
 * Create dispute
 * Only tenant, landlord, admin, super_admin
 */
router.post(
  '/',
  authenticate,
  allowRoles('tenant', 'landlord', 'admin', 'super_admin'),
  sharedContactGuard,
  disputeController.createDispute
);

/**
 * View disputes for a property
 * Must have property access
 */
router.get(
  '/property/:propertyId',
  authenticate,
  canAccessProperty,
  [param('propertyId').isInt({ min: 1 }).withMessage('propertyId must be a positive integer'), validateRequest],
  disputeController.getDisputes
);

/**
 * View current user's disputes
 */
router.get(
  '/me',
  authenticate,
  allowRoles('tenant', 'landlord', 'admin', 'super_admin'),
  disputeController.getMyDisputes
);

router.get(
  '/:disputeId',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.getDisputeDetails
);

/**
 * Add message to dispute
 */
router.post(
  '/:disputeId/messages',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  sharedContactGuard,
  disputeController.addDisputeMessage
);

/**
 * Edit a dispute message
 */
router.patch(
  '/:disputeId/messages/:messageId',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  sharedContactGuard,
  disputeController.editDisputeMessage
);

/**
 * Resolve dispute
 * Admin & Super Admin only
 */
router.patch(
  '/:disputeId/resolve',
  authenticate,
  allowRoles('admin', 'super_admin'),
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.resolveDispute
);

/**
 * Upload evidence
 */
router.post(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  upload.single('file'),
  upload.validateEvidenceMagicBytes,
  disputeController.uploadEvidence
);

router.get(
  '/:disputeId/evidence',
  authenticate,
  canAccessDispute,
  [param('disputeId').isInt({ min: 1 }).withMessage('disputeId must be a positive integer'), validateRequest],
  disputeController.listDisputeEvidence
);

/**
 * Verify evidence integrity
 */
router.get(
  '/evidence/:evidenceId',
  authenticate,
  [param('evidenceId').isInt({ min: 1 }).withMessage('evidenceId must be a positive integer'), validateRequest],
  disputeController.getEvidence
);

router.get(
  '/evidence/:evidenceId/verify',
  authenticate,
  [param('evidenceId').isInt({ min: 1 }).withMessage('evidenceId must be a positive integer'), validateRequest],
  disputeController.verifyEvidenceIntegrity
);

module.exports = router;

