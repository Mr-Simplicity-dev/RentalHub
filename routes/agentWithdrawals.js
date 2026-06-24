const express = require('express');
const AgentWithdrawalController = require('../controllers/agentWithdrawalController');
const { authenticate } = require('../config/middleware/auth');
const { requireAdminOrSuperAdmin } = require('../config/middleware/requireAdminOrSuperAdmin');
const validateRequest = require('../config/middleware/validateRequest');
const { criticalFinanceOpsLimiter } = require('../config/middleware/securityRateLimiters');
const {
	withdrawalCreateValidators,
	withdrawalQueryValidators,
	withdrawalSummaryValidators,
} = require('../config/validators/securityValidators');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * Agent Withdrawal Request Routes
 */

// Create withdrawal request
router.post(
	'/agents/:agentId/withdrawal-requests',
	criticalFinanceOpsLimiter,
	withdrawalCreateValidators,
	validateRequest,
	AgentWithdrawalController.createWithdrawalRequest
);

// Get withdrawal requests
router.get(
	'/agents/:agentId/withdrawal-requests',
	withdrawalQueryValidators,
	validateRequest,
	AgentWithdrawalController.getWithdrawalRequests
);

// Get withdrawal summary
router.get(
	'/agents/:agentId/withdrawal-summary',
	withdrawalSummaryValidators,
	validateRequest,
	AgentWithdrawalController.getWithdrawalSummary
);

// Approve withdrawal (admin only)
router.post('/withdrawals/:withdrawalId/approve', requireAdminOrSuperAdmin, criticalFinanceOpsLimiter, AgentWithdrawalController.approveWithdrawal);

// Reject withdrawal (admin only)
router.post('/withdrawals/:withdrawalId/reject', requireAdminOrSuperAdmin, criticalFinanceOpsLimiter, AgentWithdrawalController.rejectWithdrawal);

// Mark as processing (admin only)
router.post('/withdrawals/:withdrawalId/mark-processing', requireAdminOrSuperAdmin, criticalFinanceOpsLimiter, AgentWithdrawalController.markAsProcessing);

// Mark as completed (admin only)
router.post('/withdrawals/:withdrawalId/mark-completed', requireAdminOrSuperAdmin, criticalFinanceOpsLimiter, AgentWithdrawalController.markAsCompleted);

module.exports = router;
