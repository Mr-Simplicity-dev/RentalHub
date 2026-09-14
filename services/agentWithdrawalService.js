const logger = require('../config/utils/logger');
const db = require('../config/middleware/database');
const { sendEmail } = require('../config/utils/mailer');
const { sendSMS } = require('../config/utils/smsService');
const {
  createTransferRecipient,
  initiateTransfer,
} = require('./paystackTransfer.service');

const formatNaira = (amount) => `NGN ${Number(amount || 0).toLocaleString('en-NG')}`;

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
      context = {},
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

        // Log audit (actor + request context, fail-closed)
        await this.logWithdrawalAudit(
          withdrawal.id,
          'withdrawal_requested',
          null,
          'pending',
          agentUserId,
          context.factor ? `2FA verified via ${context.factor}` : '',
          context
        );

        await this.notifyWithdrawal(withdrawal, 'requested');

        return withdrawal;
      }
    } catch (error) {
      logger.error(`Error creating withdrawal request: ${error.message}`);
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
      logger.error(`Error fetching withdrawal requests: ${error.message}`);
      throw error;
    }
  }

  /**
   * Approve withdrawal request
   */
  static async approveWithdrawal(withdrawalId, approvedByUserId, notes = '', context = {}) {
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
          notes,
          context
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
            `Auto payout initiated: ${transfer?.reference || reference}`,
            context
          );

          await this.notifyWithdrawal(updated.rows[0], 'processing');

          return updated.rows[0];
        }

        await this.notifyWithdrawal(withdrawal, 'approved');

        return withdrawal;
      }
    } catch (error) {
      logger.error(`Error approving withdrawal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reject withdrawal request
   */
  static async rejectWithdrawal(withdrawalId, rejectionReason, rejectedByUserId, context = {}) {
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
          rejectionReason,
          context
        );

        await this.notifyWithdrawal(withdrawal, 'rejected', { reason: rejectionReason });

        return withdrawal;
      }
    } catch (error) {
      logger.error(`Error rejecting withdrawal: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark withdrawal as processing
   */
  static async markAsProcessing(withdrawalId, processedByUserId, context = {}) {
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
          processedByUserId,
          '',
          context
        );

        await this.notifyWithdrawal(result.rows[0], 'processing');

        return result.rows[0];
      }
    } catch (error) {
      logger.error(`Error marking withdrawal as processing: ${error.message}`);
      throw error;
    }
  }

  /**
   * Mark withdrawal as completed
   */
  static async markAsCompleted(withdrawalId, processedByUserId, paymentReference = null, context = {}) {
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
          paymentReference,
          context
        );

        await this.notifyWithdrawal(result.rows[0], 'completed');

        return result.rows[0];
      }
    } catch (error) {
      logger.error(`Error marking withdrawal as completed: ${error.message}`);
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

    // Email the agent a payout receipt (success) or a failure notice
    // (failed/reversed with the funds-returned note).
    try {
      const { sendAgentPayoutReceipt } = require('../config/utils/paymentReceipt');
      const statusLabel =
        transferStatus === 'success'
          ? 'processed'
          : transferStatus === 'failed'
            ? 'failed'
            : transferStatus === 'reversed'
              ? 'reversed'
              : 'processing';
      const note =
        transferStatus === 'success'
          ? ''
          : `${payload?.failure_reason || payload?.reason || 'Transfer failed'}. The amount has been returned to your earnings.`;
      sendAgentPayoutReceipt({
        agentUserId: withdrawal.agent_user_id,
        amount: withdrawal.amount,
        reference,
        status: statusLabel,
        note,
      }).catch(() => {});
    } catch (receiptError) {
      // Receipt email failures must not break the webhook reconciliation.
    }

    try {
      const contact = await this.getContact(withdrawal.agent_user_id);
      if (contact?.phone) {
        const label = transferStatus === 'success' ? 'completed' : transferStatus;
        await sendSMS(
          contact.phone,
          `RentalHub: withdrawal #${withdrawal.id} of ${formatNaira(withdrawal.amount)} is now ${label}.`
        );
      }
    } catch (smsError) {
      // SMS failures must not break webhook reconciliation.
    }

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
      logger.error(`Error fetching withdrawal summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch the withdrawal owner's contact details for notifications.
   */
  static async getContact(userId) {
    try {
      const result = await db.query(
        'SELECT email, phone, full_name FROM users WHERE id = $1',
        [userId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error loading withdrawal contact: ${error.message}`);
      return null;
    }
  }

  /**
   * Email + SMS the withdrawal owner on every state change. Creates an external,
   * timestamped paper trail and gives the user an early chance to report fraud.
   * Best-effort: notification failures never block the money movement.
   */
  static async notifyWithdrawal(withdrawal, event, extra = {}) {
    if (!withdrawal || !withdrawal.agent_user_id) return;
    try {
      const contact = await this.getContact(withdrawal.agent_user_id);
      if (!contact) return;

      const amount = formatNaira(withdrawal.amount);
      const ref = `#${withdrawal.id}`;
      const messages = {
        requested: `A withdrawal of ${amount} was requested from your RentalHub earnings (ref ${ref}). If you did not request this, contact support@rentalhub.com.ng immediately.`,
        approved: `Your withdrawal of ${amount} (ref ${ref}) was approved.`,
        rejected: `Your withdrawal of ${amount} (ref ${ref}) was rejected.${extra.reason ? ` Reason: ${extra.reason}` : ''}`,
        processing: `Your withdrawal of ${amount} (ref ${ref}) is being processed.`,
        completed: `Your withdrawal of ${amount} (ref ${ref}) has been completed.`,
      };
      const message = messages[event] || `Withdrawal ${ref} update: ${event}.`;
      const greeting = contact.full_name ? ` ${String(contact.full_name).split(' ')[0]}` : '';

      if (contact.email) {
        await sendEmail({
          to: contact.email,
          subject: `RentalHub withdrawal ${ref}: ${event}`,
          html: `<p>Hello${greeting},</p><p>${message}</p><p>— RentalHub NG</p>`,
        }).catch((error) => logger.error(`Withdrawal email failed: ${error.message}`));
      }

      if (contact.phone) {
        await sendSMS(contact.phone, `RentalHub: ${message}`).catch((error) =>
          logger.error(`Withdrawal SMS failed: ${error.message}`)
        );
      }
    } catch (error) {
      logger.error(`Withdrawal notification error: ${error.message}`);
    }
  }

  /**
   * Log withdrawal audit with request context (IP, device, metadata).
   * Fail-closed for finance operations: if the audit cannot be written, the
   * caller's action is aborted so no money moves without a record.
   */
  static async logWithdrawalAudit(
    withdrawalId,
    actionType,
    oldStatus,
    newStatus,
    performedByUserId,
    notes = '',
    context = {}
  ) {
    try {
      await db.query(
        `INSERT INTO agent_withdrawal_audit
         (withdrawal_request_id, action_type, old_status, new_status,
          performed_by_user_id, notes, ip_address, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
        [
          withdrawalId,
          actionType,
          oldStatus,
          newStatus,
          performedByUserId,
          notes,
          context.ip || null,
          context.userAgent || null,
          JSON.stringify({
            factor: context.factor || null,
            consent: context.consent === true,
            at: new Date().toISOString(),
            ...(context.metadata || {}),
          }),
        ]
      );
    } catch (error) {
      logger.error(`CRITICAL: withdrawal audit write failed (${actionType} #${withdrawalId}): ${error.message}`);
      throw new Error('Could not record the withdrawal audit entry; the action was aborted.');
    }
  }
}

module.exports = AgentWithdrawalService;
