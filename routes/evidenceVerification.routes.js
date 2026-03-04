const express = require('express');
const router = express.Router();
const controller =
  require('../controllers/evidenceVerification.controller');

router.get(
  '/verify/dispute/:disputeId',
  controller.verifyDispute
);

module.exports = router;