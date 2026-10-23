const express = require('express');
const router = express.Router();
const virtualAccountController = require('../controllers/virtualAccountController');

// Mounted before the CSRF and sanitizer chain, like the WhatsApp and voice
// webhooks: providers POST machine-to-machine with no browser token.
router.post('/:provider', virtualAccountController.webhook);

module.exports = router;
