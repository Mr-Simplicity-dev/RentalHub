const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const stateMigrationController = require('../controllers/stateMigrationController');
const validateRequest = require('../config/middleware/validateRequest');

router.use(authenticate);

router.post('/request', [body('target_state_id').optional().isInt(), body('reason').optional().isString().trim().isLength({ max: 2000 })], validateRequest, stateMigrationController.createMyMigrationRequest);
router.get('/my', stateMigrationController.getMyMigrationRequests);
router.get('/support/queue', stateMigrationController.listSupportQueue);
router.get('/support/audit', stateMigrationController.getMigrationAuditLogs);
router.patch('/:requestId/support-review', [param('requestId').isInt(), body('decision').optional().isString().trim().isLength({ max: 1000 })], validateRequest, stateMigrationController.reviewMigrationByDirection);
router.patch('/:requestId/super-review', [param('requestId').isInt(), body('decision').optional().isString().trim().isLength({ max: 1000 })], validateRequest, stateMigrationController.superSupportFinalReview);

module.exports = router;
