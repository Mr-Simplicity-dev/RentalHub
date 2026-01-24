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
router.get('/users/:id', adminController.getUserById);
router.delete('/users/:id', adminController.deleteUser);

// Verifications
router.get('/verifications/pending', adminController.getPendingVerifications);
router.post('/verifications/:id/approve', adminController.approveVerification);
router.post('/verifications/:id/reject', adminController.rejectVerification);

// Properties
router.get('/properties', adminController.getAllProperties);
router.get('/properties/:id', adminController.getPropertyById);

// Applications
router.get('/applications', adminController.getAllApplications);
router.get('/applications/:id', adminController.getApplicationById);
router.post('/applications/:id/approve', adminController.approveApplication);
router.post('/applications/:id/reject', adminController.rejectApplication);

module.exports = router;
