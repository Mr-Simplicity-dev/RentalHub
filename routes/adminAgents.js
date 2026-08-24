const express = require('express');
const { body, param } = require('express-validator');
const AdminAgentController = require('../controllers/adminAgentController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Admin Agent Assignment Management Routes
 */

// Get all assignments (with filters)
router.get('/assignments', AdminAgentController.getAssignments);

// Get assignment details
router.get('/assignments/:assignmentId', AdminAgentController.getAssignmentDetails);

// Assign agent to landlord
router.post('/assignments',
  [body('landlordId').isInt({ min: 1 }), body('agentId').isInt({ min: 1 })],
  validateRequest,
  AdminAgentController.assignAgent);

// Update agent permissions
router.put('/assignments/:assignmentId/permissions',
  [param('assignmentId').isInt(), body('permissions').isObject()],
  validateRequest,
  AdminAgentController.updatePermissions);

// Revoke assignment
router.post('/assignments/:assignmentId/revoke',
  [param('assignmentId').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  AdminAgentController.revokeAssignment);

// Deactivate assignment
router.post('/assignments/:assignmentId/deactivate',
  [param('assignmentId').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  AdminAgentController.deactivateAssignment);

// Reactivate assignment
router.post('/assignments/:assignmentId/reactivate',
  [param('assignmentId').isInt(), body('reason').optional().isString().trim().isLength({ max: 1000 })],
  validateRequest,
  AdminAgentController.reactivateAssignment);

module.exports = router;
