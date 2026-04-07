const AgentWithdrawalService = require('../services/agentWithdrawalService');

class AgentWithdrawalController {
  /**
   * Create withdrawal request
   */
  static async createWithdrawalRequest(req, res) {
    try {
      const { landlordId, amount, withdrawalMethod, bankAccountId, requestReason } = req.body;

      if (!landlordId || !amount) {
        return res.status(400).json({
          success: false,
          message: 'landlordId and amount are required',
        });
      }

      if (parseFloat(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      // Agents can only request their own withdrawals
      const agentId = req.user.user_type === 'agent' ? req.user.id : req.params.agentId;
      if (!agentId) {
        return res.status(400).json({
          success: false,
          message: 'Agent ID is required',
        });
      }

      const withdrawal = await AgentWithdrawalService.createWithdrawalRequest(
        parseInt(agentId),
        parseInt(landlordId),
        parseFloat(amount),
        {
          withdrawalMethod: withdrawalMethod || 'bank_transfer',
          bankAccountId: bankAccountId ? parseInt(bankAccountId) : null,
          requestReason,
        }
      );

      res.status(201).json({
        success: true,
        message: 'Withdrawal request created successfully',
        data: withdrawal,
      });
    } catch (error) {
      console.error(`Error creating withdrawal request: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create withdrawal request',
      });
    }
  }

  /**
   * Get withdrawal requests
   */
  static async getWithdrawalRequests(req, res) {
    try {
      const { status, limit = 50, offset = 0 } = req.query;

      let agentId = req.params.agentId;
      let landlordId = req.query.landlordId;

      // Agents can only view their own requests
      if (req.user.user_type === 'agent') {
        agentId = req.user.id;
      }

      const requests = await AgentWithdrawalService.getWithdrawalRequests({
        agentId: agentId ? parseInt(agentId) : null,
        landlordId: landlordId ? parseInt(landlordId) : null,
        status,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      console.error(`Error fetching withdrawal requests: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawal requests',
      });
    }
  }

  /**
   * Get withdrawal summary
   */
  static async getWithdrawalSummary(req, res) {
    try {
      const { agentId } = req.params;
      const { landlordId } = req.query;

      if (!agentId || !landlordId) {
        return res.status(400).json({
          success: false,
          message: 'agentId and landlordId are required',
        });
      }

      const summary = await AgentWithdrawalService.getWithdrawalSummary(
        parseInt(agentId),
        parseInt(landlordId)
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      console.error(`Error fetching withdrawal summary: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch withdrawal summary',
      });
    }
  }

  /**
   * Approve withdrawal (admin only)
   */
  static async approveWithdrawal(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.user_type !== 'financial_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to approve withdrawals',
        });
      }

      const { withdrawalId } = req.params;
      const { notes } = req.body;

      const withdrawal = await AgentWithdrawalService.approveWithdrawal(
        parseInt(withdrawalId),
        req.user.id,
        notes || ''
      );

      res.json({
        success: true,
        message: 'Withdrawal approved successfully',
        data: withdrawal,
      });
    } catch (error) {
      console.error(`Error approving withdrawal: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to approve withdrawal',
      });
    }
  }

  /**
   * Reject withdrawal (admin only)
   */
  static async rejectWithdrawal(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.user_type !== 'financial_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to reject withdrawals',
        });
      }

      const { withdrawalId } = req.params;
      const { rejectionReason } = req.body;

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'rejectionReason is required',
        });
      }

      const withdrawal = await AgentWithdrawalService.rejectWithdrawal(
        parseInt(withdrawalId),
        rejectionReason,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Withdrawal rejected successfully',
        data: withdrawal,
      });
    } catch (error) {
      console.error(`Error rejecting withdrawal: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to reject withdrawal',
      });
    }
  }

  /**
   * Mark as processing (admin only)
   */
  static async markAsProcessing(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.user_type !== 'financial_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to process withdrawals',
        });
      }

      const { withdrawalId } = req.params;

      const withdrawal = await AgentWithdrawalService.markAsProcessing(parseInt(withdrawalId), req.user.id);

      res.json({
        success: true,
        message: 'Withdrawal marked as processing',
        data: withdrawal,
      });
    } catch (error) {
      console.error(`Error marking withdrawal as processing: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark withdrawal as processing',
      });
    }
  }

  /**
   * Mark as completed (admin only)
   */
  static async markAsCompleted(req, res) {
    try {
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.user_type !== 'financial_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to complete withdrawals',
        });
      }

      const { withdrawalId } = req.params;
      const { paymentReference } = req.body;

      const withdrawal = await AgentWithdrawalService.markAsCompleted(
        parseInt(withdrawalId),
        req.user.id,
        paymentReference
      );

      res.json({
        success: true,
        message: 'Withdrawal marked as completed',
        data: withdrawal,
      });
    } catch (error) {
      console.error(`Error marking withdrawal as completed: ${error.message}`);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark withdrawal as completed',
      });
    }
  }
}

module.exports = AgentWithdrawalController;
