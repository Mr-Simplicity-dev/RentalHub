const express = require('express');
const router = express.Router();
const { authenticate } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const adminInspectionController = require('../controllers/adminInspectionController');

router.use(authenticate);

router.get('/', requireAdminOrSuperAdmin, adminInspectionController.getInspections);
router.get('/:id', requireAdminOrSuperAdmin, adminInspectionController.getInspectionById);
router.post('/:id/assign', requireAdminOrSuperAdmin, adminInspectionController.assignInspection);
router.post('/:id/complete', requireAdminOrSuperAdmin, adminInspectionController.completeInspection);
router.post('/:id/cancel', requireAdminOrSuperAdmin, adminInspectionController.cancelInspection);

module.exports = router;
