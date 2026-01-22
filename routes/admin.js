const express = require("express");
const router = express.Router();
const { authenticate } = require("../config/middleware/auth");
const { requireAdmin } = require('../config/middleware/requireAdmin');
const adminController = require('../controllers/adminController');

// All admin routes require auth + admin role
router.use(authenticate, requireAdmin);

// Dashboard Stats
router.get('/stats', adminController.getStats);

// Users
router.get('/users', adminController.getAllUsers);

// Verifications
router.get('/verifications/pending', adminController.getPendingVerifications);
router.post('/verifications/:id/approve', adminController.approveVerification);
router.post('/verifications/:id/reject', adminController.rejectVerification);

// Properties
router.get('/properties', adminController.getAllProperties);

// Applications
router.get('/applications', adminController.getAllApplications);

router.delete('/users/:id', adminController.deleteUser);

module.exports = router;
