const db = require('../config/middleware/database');
const {
  createTransferRecipient,
  initiateTransfer,
} = require('./paystackTransfer.service');

class AgentWithdrawalService {
  static async getWithdrawalById(withdrawalId) {
    const result = await db.query(
      `SELECT * FROM agent_withdrawal_requests WHERE id = $1 LIMIT 1`,
      [withdrawalId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a withdrawal request
   */
  static async createWithdrawalRequest(agentUserId, landlordUserId, amount, options = {}) {
    const {
      withdrawalMethod = 'bank_transfer',
      bankAccountId = null,
      bankName = null,
      bankCode = null,
      accountNumber = null,
      accountName = null,
      requestReason = null,
    } = options;

    try {
      // Check if agent has sufficient balance
      const earningsResult = await db.query(
        `SELECT total_pending FROM agent_earnings_summary 
         WHERE agent_user_id = $1 AND landlord_user_id = $2`,
        [agentUserId, landlordUserId]
      );

      if (earningsResult.rows.length === 0) {
        throw new Error('No earnings record found for this agent');
      }

      const availableBalance = earningsResult.rows[0].total_pending;
      if (parseFloat(amount) > parseFloat(availableBalance)) {
        throw new Error(`Insufficient balance. Available: ₦${availableBalance}`);
      }

      if (withdrawalMethod === 'bank_transfer' && (!bankCode || !accountNumber || !accountName)) {
        throw new Error('bankCode, accountNumber and accountName are required for bank_transfer withdrawals');
      }

      // Create withdrawal request
      const result = await db.query(
        `INSERT INTO agent_withdrawal_requests 
         (agent_user_id, landlord_user_id, amount, withdrawal_method, bank_account_id, bank_name, bank_code, account_number, account_name, request_reason, requested_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          agentUserId,
          landlordUserId,
          amount,
          withdrawalMethod,
          bankAccountId,
          bankName,
          bankCode,
          accountNumber,
          accountName,
          requestReason,
        ]
      );

      if (result.rows.length > 0) {
        const withdrawal = result.rows[0];

        // Log audit
        await this.logWithdrawalAudit(
          withdrawal.id,
          'withdrawal_requested',
          null,
          'pending',
          null
        );

        return withdrawal;
      }
    } catch (error) {
      console.error(`Error creating withdrawal request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get withdrawal requests
   */
  static async getWithdrawalRequests(filters = {}) {
    const { agentId, landlordId, status, limit = 50, offset = 0 } = filters;

    try {
      let query = 'SELECT * FROM agent_withdrawal_requests WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (agentId) {
        query += ` AND agent_user_id = $${paramIndex}`;
        params.push(agentId);
        paramIndex++;
      }

      if (landlordId) {
        query += ` AND landlord_user_id = $${paramIndex}`;
        params.push(landlordId);
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      console.error(`Error fetching withdrawal requests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Approve withdrawal request
   */
  static async approveWithdrawal(withdrawalId, approvedByUserId, notes = '') {
    try {
      const existing = await this.getWithdrawalById(withdrawalId);
      if (!existing) {
        throw new Error('Withdrawal request not found');
      }

      if (existing.status !== 'pending') {
        throw new Error(`Only pending withdrawals can be approved (current: ${existing.status})`);
      }

      const result = await db.query(
        `UPDATE agent_withdrawal_requests
         SET status = 'approved', approved_by_user_id = $1, approved_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [approvedByUserId, withdrawalId]
      );

      if (result.rows.length > 0) {
        const withdrawal = result.rows[0];
        await this.logWithdrawalAudit(
          withdrawalId,
          'withdrawal_approved',
          'pending',
          'approved',
          approvedByUserId,
          notes
        );

        if (withdrawal.withdrawal_method === 'bank_transfer') {
          if (!withdrawal.bank_code || !withdrawal.account_number || !withdrawal.account_name) {
            throw new Error('Cannot auto-payout: missing bank transfer details');
          }

          let recipientCode = withdrawal.paystack_recipient_code;

          if (!recipientCode) {
            const recipient = await createTransferRecipient({
              name: withdrawal.account_name,
              accountNumber: withdrawal.account_number,
              bankCode: withdrawal.bank_code,
            });

            recipientCode = recipient.recipient_code;

            await db.query(
              `UPDATE agent_withdrawal_requests
               SET paystack_recipient_code = $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [recipientCode, withdrawalId]
            );
          }

          const reference = `AGW_${withdrawalId}_${Date.now()}`;
          const transfer = await initiateTransfer({
            amount: withdrawal.amount,
            recipientCode,
            reason: `Agent withdrawal #${withdrawalId}`,
            reference,
          });

          const transferStatus = transfer?.status || 'pending';

          const updated = await db.query(
            `UPDATE agent_withdrawal_requests
             SET status = 'processing',
                 processed_date = CURRENT_TIMESTAMP,
                 payout_attempted_at = CURRENT_TIMESTAMP,
                 paystack_transfer_code = $1,
                 paystack_transfer_reference = $2,
                 paystack_transfer_status = $3,
                 paystack_last_response = $4,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [
              transfer?.transfer_code || null,
              transfer?.reference || reference,
              transferStatus,
              JSON.stringify(transfer || {}),
              withdrawalId,
            ]
          );

          await this.logWithdrawalAudit(
            withdrawalId,
            'withdrawal_processed',
            'approved',
            'processing',
            approvedByUserId,
            `Auto payout initiated: ${transfer?.reference || reference}`
          );

          return updated.rows[0];
        }

        return withdrawal;
      }
    } catch (error) {
      console.error(`Error approving withdrawal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject withdrawal request
   */
  static async rejectWithdrawal(withdrawalId, rejectionReason, rejectedByUserId) {
    try {
      const result = await db.query(
        `UPDATE agent_withdrawal_requests
         SET status = 'rejected', reason_for_rejection = $1, approved_by_user_id = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [rejectionReason, rejectedByUserId, withdrawalId]
      );

      if (result.rows.length > 0) {
        const withdrawal = result.rows[0];
        await this.logWithdrawalAudit(
          withdrawalId,
          'withdrawal_rejected',
          'pending',
          'rejected',
          rejectedByUserId,
          rejectionReason
        );

        return withdrawal;
      }
    } catch (error) {
      console.error(`Error rejecting withdrawal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark withdrawal as processing
   */
  static async markAsProcessing(withdrawalId, processedByUserId) {
    try {
      const result = await db.query(
        `UPDATE agent_withdrawal_requests
         SET status = 'processing', processed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [withdrawalId]
      );

      if (result.rows.length > 0) {
        await this.logWithdrawalAudit(
          withdrawalId,
          'withdrawal_processed',
          'approved',
          'processing',
          processedByUserId
        );

        return result.rows[0];
      }
    } catch (error) {
      console.error(`Error marking withdrawal as processing: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark withdrawal as completed
   */
  static async markAsCompleted(withdrawalId, processedByUserId, paymentReference = null) {
    try {
      const result = await db.query(
        `UPDATE agent_withdrawal_requests
         SET status = 'completed', completed_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [withdrawalId]
      );

      if (result.rows.length > 0) {
        await this.logWithdrawalAudit(
          withdrawalId,
          'withdrawal_completed',
          'processing',
          'completed',
          processedByUserId,
          paymentReference
        );

        return result.rows[0];
      }
    } catch (error) {
      console.error(`Error marking withdrawal as completed: ${error.message}`);
      throw error;
    }
  }

  static async reconcilePaystackTransfer(reference, transferStatus, payload = {}) {
    const findResult = await db.query(
      `SELECT *
       FROM agent_withdrawal_requests
       WHERE paystack_transfer_reference = $1
       LIMIT 1`,
      [reference]
    );

    if (findResult.rows.length === 0) {
      return null;
    }

    const withdrawal = findResult.rows[0];
    let nextStatus = withdrawal.status;

    if (transferStatus === 'success') {
      nextStatus = 'completed';
    } else if (transferStatus === 'failed' || transferStatus === 'reversed') {
      nextStatus = 'approved';
    } else {
      nextStatus = 'processing';
    }

    const updated = await db.query(
      `UPDATE agent_withdrawal_requests
       SET status = $1,
           completed_date = CASE WHEN $1 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_date END,
           paystack_transfer_status = $2,
           paystack_last_response = $3,
           payout_failed_reason = CASE WHEN $2 IN ('failed','reversed') THEN $4 ELSE payout_failed_reason END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [
        nextStatus,
        transferStatus,
        JSON.stringify(payload || {}),
        payload?.failure_reason || payload?.reason || null,
        withdrawal.id,
      ]
    );

    await this.logWithdrawalAudit(
      withdrawal.id,
      'withdrawal_transfer_webhook',
      withdrawal.status,
      nextStatus,
      null,
      `Paystack status: ${transferStatus}`
    );

    return updated.rows[0] || null;
  }

  /**
   * Get withdrawal summary for agent
   */
  static async getWithdrawalSummary(agentUserId, landlordUserId) {
    try {
      const result = await db.query(
        `SELECT 
          COUNT(*) as total_requests,
          SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
          SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END) as approved_amount,
          SUM(CASE WHEN status IN ('processing', 'completed') THEN amount ELSE 0 END) as processed_amount,
          SUM(CASE WHEN status = 'rejected' THEN amount ELSE 0 END) as rejected_amount,
          MAX(completed_date) as last_completed_date
         FROM agent_withdrawal_requests
         WHERE agent_user_id = $1 AND landlord_user_id = $2`,
        [agentUserId, landlordUserId]
      );

      return result.rows[0] || {};
    } catch (error) {
      console.error(`Error fetching withdrawal summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log withdrawal audit
   */
  static async logWithdrawalAudit(withdrawalId, actionType, oldStatus, newStatus, performedByUserId, notes = '') {
    try {
      await db.query(
        `INSERT INTO agent_withdrawal_audit 
         (withdrawal_request_id, action_type, old_status, new_status, performed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [withdrawalId, actionType, oldStatus, newStatus, performedByUserId, notes]
      );
    } catch (error) {
      console.error(`Error logging withdrawal audit: ${error.message}`);
      // Don't throw - audit shouldn't fail the main operation
    }
  }
}

module.exports = AgentWithdrawalService;
