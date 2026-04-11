const AgentCommissionService = require('../services/agentCommissionService');

const ADMIN_PAYOUT_ROLES = ['admin', 'super_admin', 'financial_admin', 'super_financial_admin'];

class AgentCommissionController {
  /**
   * Get agent's earnings summary
   */
  static async getEarnings(req, res) {
    try {
      const { agentId } = req.params;
      const { landlordId } = req.query;

      // Verify authorization
      if (req.user.id !== parseInt(agentId) && req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view this agent earnings',
        });
      }

      const earnings = await AgentCommissionService.getAgentEarnings(
        parseInt(agentId),
        landlordId ? parseInt(landlordId) : null
      );

      res.json({
        success: true,
        data: earnings,
      });
    } catch (error) {
      console.error(`Error fetching earnings: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch earnings',
      });
    }
  }

  /**
   * Get commission history
   */
  static async getHistory(req, res) {
    try {
      const { agentId } = req.params;
      const { landlordId, status, paymentStatus, limit = 50, offset = 0 } = req.query;

      // Verify authorization
      if (req.user.id !== parseInt(agentId) && req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view this agent history',
        });
      }

      const history = await AgentCommissionService.getCommissionHistory(
        parseInt(agentId),
        landlordId ? parseInt(landlordId) : null,
        {
          status,
          paymentStatus,
          limit: parseInt(limit),
          offset: parseInt(offset),
        }
      );

      res.json({
        success: true,
        data: history,
      });
    } catch (error) {
      console.error(`Error fetching commission history: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch commission history',
      });
    }
  }

  /**
   * Record a commission (admin/landlord only)
   */
  static async recordCommission(req, res) {
    try {
      const { agentId } = req.params;
      const {
        landlordId,
        transactionType,
        amount,
        relatedEntityType,
        relatedEntityId,
        description,
        notes,
      } = req.body;

      // Verify authorization
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.id !== parseInt(landlordId)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to record commissions',
        });
      }

      if (!transactionType || amount === undefined) {
        return res.status(400).json({
          success: false,
          message: 'transactionType and amount are required',
        });
      }

      const commission = await AgentCommissionService.recordCommission(
        parseInt(agentId),
        parseInt(landlordId),
        transactionType,
        parseFloat(amount),
        {
          relatedEntityType,
          relatedEntityId: relatedEntityId ? parseInt(relatedEntityId) : null,
          description,
          processedByUserId: req.user.id,
          notes,
        }
      );

      res.status(201).json({
        success: true,
        message: 'Commission recorded successfully',
        data: commission,
      });
    } catch (error) {
      console.error(`Error recording commission: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to record commission',
      });
    }
  }

  /**
   * Verify commission (admin only)
   */
  static async verifyCommission(req, res) {
    try {
      const { commissionId } = req.params;

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to verify commissions',
        });
      }

      const commission = await AgentCommissionService.verifyCommission(
        parseInt(commissionId),
        req.user.id
      );

      if (!commission) {
        return res.status(404).json({
          success: false,
          message: 'Commission not found',
        });
      }

      res.json({
        success: true,
        message: 'Commission verified successfully',
        data: commission,
      });
    } catch (error) {
      console.error(`Error verifying commission: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to verify commission',
      });
    }
  }

  /**
   * Reverse/Adjust commission (admin only)
   */
  static async reverseCommission(req, res) {
    try {
      const { commissionId } = req.params;
      const { reverseAmount, reason } = req.body;

      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to reverse commissions',
        });
      }

      const reversal = await AgentCommissionService.reverseCommission(
        parseInt(commissionId),
        reverseAmount ? parseFloat(reverseAmount) : null,
        req.user.id,
        reason || ''
      );

      res.json({
        success: true,
        message: 'Commission reversed successfully',
        data: reversal,
      });
    } catch (error) {
      console.error(`Error reversing commission: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to reverse commission',
      });
    }
  }

  /**
   * Set commission rates (landlord/admin only)
   */
  static async setCommissionRate(req, res) {
    try {
      const { agentId } = req.params;
      const { landlordId, commissionType, rate } = req.body;

      // Verify authorization
      if (req.user.user_type !== 'admin' && req.user.user_type !== 'super_admin' && req.user.id !== parseInt(landlordId)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to set commission rates',
        });
      }

      if (!commissionType || rate === undefined) {
        return res.status(400).json({
          success: false,
          message: 'commissionType and rate are required',
        });
      }

      const commissionRate = await AgentCommissionService.setCommissionRate(
        parseInt(agentId),
        parseInt(landlordId),
        commissionType,
        parseFloat(rate),
        req.user.id
      );

      res.json({
        success: true,
        message: 'Commission rate set successfully',
        data: commissionRate,
      });
    } catch (error) {
      console.error(`Error setting commission rate: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to set commission rate',
      });
    }
  }

  /**
   * Get commission rates
   */
  static async getCommissionRates(req, res) {
    try {
      const { agentId } = req.params;
      const { landlordId } = req.query;
      const requesterId = Number(req.user?.id);
      const requesterRole = req.user?.user_type;
      const isAdminLike = ADMIN_PAYOUT_ROLES.includes(requesterRole);
      const isAgentSelf = requesterRole === 'agent' && requesterId === Number(agentId);
      const isLandlordSelf = requesterRole === 'landlord' && Number(landlordId) === requesterId;

      if (!isAdminLike && !isAgentSelf && !isLandlordSelf) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to view commission rates',
        });
      }

      const rates = await AgentCommissionService.getCommissionRates(
        parseInt(agentId),
        landlordId ? parseInt(landlordId) : null
      );

      res.json({
        success: true,
        data: rates,
      });
    } catch (error) {
      console.error(`Error fetching commission rates: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch commission rates',
      });
    }
  }

  /**
   * Process payout (admin only)
   */
  static async processPayout(req, res) {
    try {
      const { agentIds, payoutDate, paymentMethod } = req.body;

      if (!ADMIN_PAYOUT_ROLES.includes(req.user.user_type)) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to process payouts',
        });
      }

      if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0 || !payoutDate) {
        return res.status(400).json({
          success: false,
          message: 'agentIds array and payoutDate are required',
        });
      }

      const payout = await AgentCommissionService.processPayout(
        agentIds.map(id => parseInt(id)),
        new Date(payoutDate),
        paymentMethod || 'bank_transfer',
        req.user.id
      );

      res.json({
        success: true,
        message: 'Payout processed successfully',
        data: payout,
      });
    } catch (error) {
      console.error(`Error processing payout: ${error.message}`);
      res.status(500).json({
        success: false,
        message: 'Failed to process payout',
      });
    }
  }
}

module.exports = AgentCommissionController;
