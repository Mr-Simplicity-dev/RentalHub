const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const {
  getDiasporaAdminOverview,
  dismissDiasporaReviewFlag,
  requireDiasporaAdmin,
} = require('../services/diasporaAdminService');

router.use(authenticate);
router.use(requireDiasporaAdmin);

// Diaspora registration overview (list + stats)
router.get('/overview', getDiasporaAdminOverview);

// Mark a diaspora user's Nigerian-funded review flag as reviewed
router.post('/users/:userId/dismiss', dismissDiasporaReviewFlag);

module.exports = router;
