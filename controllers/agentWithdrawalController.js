const AgentWithdrawalService = require('../services/agentWithdrawalService');
const { isValidPaystackSignature } = require('../services/paystackTransfer.service');

const ADMIN_WITHDRAWAL_ROLES = ['admin', 'super_admin', 'financial_admin', 'super_financial_admin'];

class AgentWithdrawalController {
  /**
   * Create withdrawal request
   */
  static async createWithdrawalRequest(req, res) {
    try {
      const {
        landlordId,
        amount,
        withdrawalMethod,
        bankAccountId,
        bankName,
        bankCode,
        accountNumber,
        accountName,
        requestReason,
      } = req.body;
      const userType = req.user?.user_type;
      const isAdminLike = ADMIN_WITHDRAWAL_ROLES.includes(userType);

      if (userType !== 'agent' && !isAdminLike) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to create withdrawal requests',
        });
      }

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
      const agentId = userType === 'agent' ? req.user.id : req.params.agentId;
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
          bankName: bankName || null,
          bankCode: bankCode || null,
          accountNumber: accountNumber || null,
          accountName: accountName || null,
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
      const userType = req.user?.user_type;
      const isAdminLike = ADMIN_WITHDRAWAL_ROLES.includes(userType);

      let agentId = req.params.agentId;
      let landlordId = req.query.landlordId;

      // Agents can only view their own requests
      if (userType === 'agent') {
        agentId = req.user.id;
      } else if (userType === 'landlord') {
        landlordId = req.user.id;
      } else if (!isAdminLike) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view withdrawal requests',
        });
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
      const userType = req.user?.user_type;
      const isAdminLike = ADMIN_WITHDRAWAL_ROLES.includes(userType);
      let { agentId } = req.params;
      let { landlordId } = req.query;

      if (userType === 'agent') {
        agentId = req.user.id;
      } else if (userType === 'landlord') {
        landlordId = req.user.id;
      } else if (!isAdminLike) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view withdrawal summary',
        });
      }

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
      if (!ADMIN_WITHDRAWAL_ROLES.includes(req.user.user_type)) {
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
      if (!ADMIN_WITHDRAWAL_ROLES.includes(req.user.user_type)) {
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
      if (!ADMIN_WITHDRAWAL_ROLES.includes(req.user.user_type)) {
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
      if (!ADMIN_WITHDRAWAL_ROLES.includes(req.user.user_type)) {
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

  static async paystackTransferWebhook(req, res) {
    try {
      const signature = req.headers['x-paystack-signature'];
      const rawBody = req.rawBody || JSON.stringify(req.body || {});

      if (!isValidPaystackSignature(rawBody, signature)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid Paystack signature',
        });
      }

      const event = req.body?.event;
      const data = req.body?.data || {};

      if (!event || !event.startsWith('transfer.')) {
        return res.json({ success: true, message: 'Ignored non-transfer event' });
      }

      const reference = data.reference;
      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Missing transfer reference',
        });
      }

      let transferStatus = 'pending';
      if (event === 'transfer.success') {
        transferStatus = 'success';
      } else if (event === 'transfer.failed') {
        transferStatus = 'failed';
      } else if (event === 'transfer.reversed') {
        transferStatus = 'reversed';
      }

      await AgentWithdrawalService.reconcilePaystackTransfer(reference, transferStatus, data);

      return res.json({
        success: true,
        message: 'Webhook processed',
      });
    } catch (error) {
      console.error(`Paystack transfer webhook error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to process webhook',
      });
    }
  }
}

module.exports = AgentWithdrawalController;
