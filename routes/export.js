const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { allowRoles } = require('../middleware/roleMiddleware');
const exportController = require('../controllers/exportController');

router.get(
  '/dispute/:disputeId',
  authenticate,
  allowRoles('admin','super_admin'),
  exportController.exportDisputeBundle
);

module.exports = router;