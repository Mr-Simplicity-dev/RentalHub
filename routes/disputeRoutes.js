const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../config/middleware/roleMiddleware');
const disputeController = require('../controllers/disputeController');
const courtBundleController = require('../controllers/courtBundleController');

router.post(
  '/disputes/:disputeId/seal',
  authenticate,
  allowRoles('admin','lawyer'),
  disputeController.sealDispute
);



router.get(
  '/:disputeId/court-bundle',
  authenticate,
  allowRoles('admin','lawyer','super_admin'),
  courtBundleController.downloadCourtBundle
);

module.exports = router;