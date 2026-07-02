const express = require('express');
const controller = require('../controllers/premblyRecoveryController');

const router = express.Router();

router.post('/webhook/:callbackToken', controller.receiveWebhook);
router.get('/attempts/:attemptId', controller.getRegistrationAttempt);

module.exports = router;
