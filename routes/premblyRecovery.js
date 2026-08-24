const express = require('express');
const controller = require('../controllers/premblyRecoveryController');
const { authenticate } = require('../config/middleware/auth');

const router = express.Router();

router.post('/webhook/:callbackToken', controller.receiveWebhook);
router.get('/attempts/:attemptId', authenticate, controller.getRegistrationAttempt);

module.exports = router;
