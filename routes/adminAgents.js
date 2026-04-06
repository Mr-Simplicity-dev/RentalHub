const express = require('express');
const AdminAgentController = require('../controllers/adminAgentController');
const auth = require('../config/middleware/auth');
const { requireAdmin } = require('../config/middleware/roleMiddleware');

const router = express.Router();

// All routes require authentication
router.use(auth);

/**
 * Admin Agent Assignment Management Routes
 */

// Get all assignments (with filters)
router.get('/assignments', AdminAgentController.getAssignments);

// Get assignment details
router.get('/assignments/:assignmentId', AdminAgentController.getAssignmentDetails);

// Assign agent to landlord
router.post('/assignments', AdminAgentController.assignAgent);

// Update agent permissions
router.put('/assignments/:assignmentId/permissions', AdminAgentController.updatePermissions);

// Revoke assignment
router.post('/assignments/:assignmentId/revoke', AdminAgentController.revokeAssignment);

// Deactivate assignment
router.post('/assignments/:assignmentId/deactivate', AdminAgentController.deactivateAssignment);

// Reactivate assignment
router.post('/assignments/:assignmentId/reactivate', AdminAgentController.reactivateAssignment);

module.exports = router;
