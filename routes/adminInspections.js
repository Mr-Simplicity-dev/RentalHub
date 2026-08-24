const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const adminInspectionController = require('../controllers/adminInspectionController');
const validateRequest = require('../config/middleware/validateRequest');

router.use(authenticate);

router.get('/', requireAdminOrSuperAdmin, adminInspectionController.getInspections);
router.get('/:id', requireAdminOrSuperAdmin, adminInspectionController.getInspectionById);
router.get('/:id/operations', requireAdminOrSuperAdmin, adminInspectionController.getInspectionOperations);
router.post('/:id/assign', [param('id').isInt()], validateRequest, requireAdminOrSuperAdmin, adminInspectionController.assignInspection);
router.post('/:id/start', [param('id').isInt()], validateRequest, requireAdminOrSuperAdmin, adminInspectionController.startInspection);
router.post('/:id/complete', [param('id').isInt(), body('notes').optional().isString().trim().isLength({ max: 5000 })], validateRequest, requireAdminOrSuperAdmin, adminInspectionController.completeInspection);
router.post('/:id/cancel', [param('id').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })], validateRequest, requireAdminOrSuperAdmin, adminInspectionController.cancelInspection);

module.exports = router;
