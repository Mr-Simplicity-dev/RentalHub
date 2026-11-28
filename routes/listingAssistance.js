const express = require('express');
const { body, param } = require('express-validator');
const { authenticate, isLandlord } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const validateRequest = require('../config/middleware/validateRequest');
const controller = require('../controllers/listingAssistanceController');

const router = express.Router();

router.use(authenticate);

router.post(
  '/requests',
  isLandlord,
  [
    body('stateId').isInt({ min: 1 }),
    body('lgaName').isString().trim().isLength({ min: 2, max: 120 }),
    body('propertyId').optional({ checkFalsy: true }).isInt({ min: 1 }),
  ],
  validateRequest,
  controller.createRequest
);

router.get('/requests/mine', isLandlord, controller.getLandlordStatus);

router.get('/staff/requests', requireAdminOrSuperAdmin, controller.listStaffRequests);

router.post(
  '/staff/requests/:requestId/assign',
  [
    param('requestId').isInt({ min: 1 }),
    body('agentId').isInt({ min: 1 }),
  ],
  validateRequest,
  requireAdminOrSuperAdmin,
  controller.assignRequest
);

module.exports = router;
