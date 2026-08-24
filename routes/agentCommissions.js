const express = require('express');
const { body, param } = require('express-validator');
const AgentCommissionController = require('../controllers/agentCommissionController');
const { authenticate } = require('../config/middleware/auth');
const validateRequest = require('../config/middleware/validateRequest');
const {
	commissionRatesSetValidators,
	commissionRatesGetValidators,
} = require('../config/validators/securityValidators');

const router = express.Router();

// Middleware to ensure user is authenticated
router.use(authenticate);

// Get agent earnings summary
router.get('/agents/:agentId/earnings', AgentCommissionController.getEarnings);

// Get commission history
router.get('/agents/:agentId/history', AgentCommissionController.getHistory);

// Record a commission
router.post('/agents/:agentId/commissions', [param('agentId').isInt(), body('amount').isFloat({ min: 0 }), body('description').optional().isString().trim().isLength({ max: 2000 })], validateRequest, AgentCommissionController.recordCommission);

// Verify a commission (admin only)
router.put('/commissions/:commissionId/verify', [param('commissionId').isInt()], validateRequest, AgentCommissionController.verifyCommission);

// Reverse/Adjust a commission (admin only)
router.post('/commissions/:commissionId/reverse', [param('commissionId').isInt(), body('reason').optional().isString().trim().isLength({ max: 2000 })], validateRequest, AgentCommissionController.reverseCommission);

// Set commission rates
router.post(
	'/agents/:agentId/commission-rates',
	commissionRatesSetValidators,
	validateRequest,
	AgentCommissionController.setCommissionRate
);

// Get commission rates
router.get(
	'/agents/:agentId/commission-rates',
	commissionRatesGetValidators,
	validateRequest,
	AgentCommissionController.getCommissionRates
);

// Process payout (admin only)
router.post('/payouts', [body('agentIds').isArray({ min: 1 }), body('agentIds.*').isInt(), body('payoutDate').optional().isString().trim()], validateRequest, AgentCommissionController.processPayout);

module.exports = router;
