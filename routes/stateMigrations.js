const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const stateMigrationController = require('../controllers/stateMigrationController');

router.use(authenticate);

router.post('/request', stateMigrationController.createMyMigrationRequest);
router.get('/my', stateMigrationController.getMyMigrationRequests);
router.get('/support/queue', stateMigrationController.listSupportQueue);
router.get('/support/audit', stateMigrationController.getMigrationAuditLogs);
router.patch('/:requestId/support-review', stateMigrationController.reviewMigrationByDirection);
router.patch('/:requestId/super-review', stateMigrationController.superSupportFinalReview);

module.exports = router;
