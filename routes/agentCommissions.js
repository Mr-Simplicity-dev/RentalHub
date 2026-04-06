const express = require('express');
const AgentCommissionController = require('../controllers/agentCommissionController');
const auth = require('../config/middleware/auth');

const router = express.Router();

// Middleware to ensure user is authenticated
router.use(auth);

// Get agent earnings summary
router.get('/agents/:agentId/earnings', AgentCommissionController.getEarnings);

// Get commission history
router.get('/agents/:agentId/history', AgentCommissionController.getHistory);

// Record a commission
router.post('/agents/:agentId/commissions', AgentCommissionController.recordCommission);

// Verify a commission (admin only)
router.put('/commissions/:commissionId/verify', AgentCommissionController.verifyCommission);

// Reverse/Adjust a commission (admin only)
router.post('/commissions/:commissionId/reverse', AgentCommissionController.reverseCommission);

// Set commission rates
router.post('/agents/:agentId/commission-rates', AgentCommissionController.setCommissionRate);

// Get commission rates
router.get('/agents/:agentId/commission-rates', AgentCommissionController.getCommissionRates);

// Process payout (admin only)
router.post('/payouts', AgentCommissionController.processPayout);

module.exports = router;
