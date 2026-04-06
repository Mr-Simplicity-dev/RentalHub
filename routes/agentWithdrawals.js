const express = require('express');
const AgentWithdrawalController = require('../controllers/agentWithdrawalController');
const auth = require('../config/middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(auth);

/**
 * Agent Withdrawal Request Routes
 */

// Create withdrawal request
router.post('/agents/:agentId/withdrawal-requests', AgentWithdrawalController.createWithdrawalRequest);

// Get withdrawal requests
router.get('/agents/:agentId/withdrawal-requests', AgentWithdrawalController.getWithdrawalRequests);

// Get withdrawal summary
router.get('/agents/:agentId/withdrawal-summary', AgentWithdrawalController.getWithdrawalSummary);

// Approve withdrawal (admin only)
router.post('/withdrawals/:withdrawalId/approve', AgentWithdrawalController.approveWithdrawal);

// Reject withdrawal (admin only)
router.post('/withdrawals/:withdrawalId/reject', AgentWithdrawalController.rejectWithdrawal);

// Mark as processing (admin only)
router.post('/withdrawals/:withdrawalId/mark-processing', AgentWithdrawalController.markAsProcessing);

// Mark as completed (admin only)
router.post('/withdrawals/:withdrawalId/mark-completed', AgentWithdrawalController.markAsCompleted);

module.exports = router;
