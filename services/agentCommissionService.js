const db = require('../config/database');
const logger = require('../config/logging');

class AgentCommissionService {
  /**
   * Record a commission for an agent
   */
  static async recordCommission(agentUserId, landlordUserId, transactionType, amount, options = {}) {
    const {
      relatedEntityType = null,
      relatedEntityId = null,
      description = null,
      processedByUserId = null,
      notes = null,
    } = options;

    try {
      const result = await db.query(
        `INSERT INTO agent_commission_ledger 
         (agent_user_id, landlord_user_id, transaction_type, related_entity_type, 
          related_entity_id, amount, description, processed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          agentUserId,
          landlordUserId,
          transactionType,
          relatedEntityType,
          relatedEntityId,
          amount,
          description,
          processedByUserId,
          notes,
        ]
      );

      if (result.rows.length > 0) {
        // Update earnings summary
        await this.updateEarningsSummary(agentUserId, landlordUserId);
        
        // Log audit trail
        await this.logAuditTrail(agentUserId, 'commission_created', result.rows[0].id, null, result.rows[0], processedByUserId);

        return result.rows[0];
      }
    } catch (error) {
      logger.error(`Error recording commission: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get agent's total commissions
   */
  static async getAgentEarnings(agentUserId, landlordUserId = null) {
    try {
      let query = `
        SELECT 
          agent_user_id,
          landlord_user_id,
          SUM(CASE WHEN status IN ('earned', 'verified') AND amount > 0 THEN amount ELSE 0 END) as total_earned,
          SUM(CASE WHEN payment_status = 'paid' THEN amount ELSE 0 END) as total_paid,
          SUM(CASE WHEN payment_status = 'unpaid' AND status IN ('earned', 'verified') AND amount > 0 THEN amount ELSE 0 END) as total_pending,
          SUM(CASE WHEN status = 'reversed' THEN ABS(amount) ELSE 0 END) as total_reversed,
          COUNT(*) as transaction_count,
          MAX(paid_on) as last_payment_date
        FROM agent_commission_ledger
        WHERE agent_user_id = $1
      `;

      const params = [agentUserId];

      if (landlordUserId) {
        query += ` AND landlord_user_id = $2`;
        params.push(landlordUserId);
      }

      query += ` GROUP BY agent_user_id, landlord_user_id`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching agent earnings: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get commission history for an agent
   */
  static async getCommissionHistory(agentUserId, landlordUserId = null, filters = {}) {
    const { status, paymentStatus, limit = 50, offset = 0 } = filters;

    try {
      let query = `
        SELECT *
        FROM agent_commission_ledger
        WHERE agent_user_id = $1
      `;

      const params = [agentUserId];
      let paramIndex = 2;

      if (landlordUserId) {
        query += ` AND landlord_user_id = $${paramIndex}`;
        params.push(landlordUserId);
        paramIndex++;
      }

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (paymentStatus) {
        query += ` AND payment_status = $${paramIndex}`;
        params.push(paymentStatus);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching commission history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify commission entries
   */
  static async verifyCommission(commissionId, verifiedByUserId) {
    try {
      const result = await db.query(
        `UPDATE agent_commission_ledger
         SET status = 'verified', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [commissionId]
      );

      if (result.rows.length > 0) {
        const commission = result.rows[0];
        await this.logAuditTrail(
          commission.agent_user_id,
          'commission_verified',
          commissionId,
          { status: 'pending_verification' },
          { status: 'verified' },
          verifiedByUserId
        );

        return commission;
      }
    } catch (error) {
      logger.error(`Error verifying commission: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reverse/adjust a commission
   */
  static async reverseCommission(commissionId, reverseAmount = null, reversedByUserId = null, reason = '') {
    try {
      const getCommission = await db.query(
        'SELECT * FROM agent_commission_ledger WHERE id = $1',
        [commissionId]
      );

      if (getCommission.rows.length === 0) {
        throw new Error('Commission not found');
      }

      const commission = getCommission.rows[0];
      const amount = reverseAmount || commission.amount;

      // Create reversal entry
      const result = await db.query(
        `INSERT INTO agent_commission_ledger 
         (agent_user_id, landlord_user_id, transaction_type, related_entity_type, 
          related_entity_id, amount, status, description, processed_by_user_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          commission.agent_user_id,
          commission.landlord_user_id,
          'adjustment',
          commission.related_entity_type,
          commission.related_entity_id,
          -amount,
          'reversed',
          `Reversal of commission #${commissionId}`,
          reversedByUserId,
          reason,
        ]
      );

      if (result.rows.length > 0) {
        // Update original commission status
        await db.query(
          `UPDATE agent_commission_ledger SET status = 'reversed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [commissionId]
        );

        await this.updateEarningsSummary(commission.agent_user_id, commission.landlord_user_id);
        await this.logAuditTrail(
          commission.agent_user_id,
          'commission_reversed',
          commissionId,
          { status: commission.status, amount: commission.amount },
          { status: 'reversed', reversal_entry_id: result.rows[0].id },
          reversedByUserId
        );

        return result.rows[0];
      }
    } catch (error) {
      logger.error(`Error reversing commission: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set commission rates for an agent
   */
  static async setCommissionRate(agentUserId, landlordUserId, commissionType, rate, createdByUserId) {
    try {
      // Deactivate old rates
      await db.query(
        `UPDATE agent_commission_rates
         SET is_active = FALSE, effective_to = CURRENT_TIMESTAMP
         WHERE agent_user_id = $1 AND landlord_user_id = $2 AND commission_type = $3 AND is_active = TRUE`,
        [agentUserId, landlordUserId, commissionType]
      );

      // Create new rate
      const result = await db.query(
        `INSERT INTO agent_commission_rates 
         (agent_user_id, tenant_user_id, commission_type, commission_rate, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [agentUserId, landlordUserId, commissionType, rate, createdByUserId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error(`Error setting commission rate: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get active commission rates for an agent
   */
  static async getCommissionRates(agentUserId, landlordUserId = null) {
    try {
      let query = `
        SELECT *
        FROM agent_commission_rates
        WHERE agent_user_id = $1 AND is_active = TRUE
      `;

      const params = [agentUserId];

      if (landlordUserId) {
        query += ` AND tenant_user_id = $2`;
        params.push(landlordUserId);
      }

      query += ` ORDER BY commission_type`;

      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      logger.error(`Error fetching commission rates: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process payout for agents
   */
  static async processPayout(agentIds, payoutDate, paymentMethod, processedByUserId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Create payout batch
      const batchResult = await client.query(
        `INSERT INTO agent_payout_batches 
         (payout_date, payout_status, total_amount, transaction_count, payment_method, processed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [payoutDate, 'initiated', 0, 0, paymentMethod, processedByUserId]
      );

      const batch = batchResult.rows[0];

      // Process each agent
      let totalAmount = 0;
      let transactionCount = 0;

      for (const agentId of agentIds) {
        // Get unpaid commissions
        const commissionsResult = await client.query(
          `SELECT id, amount
           FROM agent_commission_ledger
           WHERE agent_user_id = $1 AND payment_status = 'unpaid' AND status IN ('earned', 'verified')
           ORDER BY created_at ASC`,
          [agentId]
        );

        for (const commission of commissionsResult.rows) {
          // Link to payout batch
          await client.query(
            `INSERT INTO agent_payout_details (payout_batch_id, commission_ledger_id, amount_paid)
             VALUES ($1, $2, $3)`,
            [batch.id, commission.id, commission.amount]
          );

          // Update commission to paid
          await client.query(
            `UPDATE agent_commission_ledger
             SET payment_status = 'paid', paid_on = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [payoutDate, commission.id]
          );

          totalAmount += parseFloat(commission.amount);
          transactionCount++;
        }
      }

      // Update batch totals
      const updateBatchResult = await client.query(
        `UPDATE agent_payout_batches
         SET total_amount = $1, transaction_count = $2, payout_status = 'completed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [totalAmount, transactionCount, batch.id]
      );

      await client.query('COMMIT');
      return updateBatchResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error(`Error processing payout: ${error.message}`);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update earnings summary for an agent
   */
  static async updateEarningsSummary(agentUserId, landlordUserId) {
    try {
      const earnings = await this.getAgentEarnings(agentUserId, landlordUserId);

      if (earnings.length > 0) {
        const earning = earnings[0];

        await db.query(
          `INSERT INTO agent_earnings_summary 
           (agent_user_id, landlord_user_id, total_earned, total_paid, total_pending, total_reversed, transaction_count, last_updated)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
           ON CONFLICT (agent_user_id) DO UPDATE SET
             total_earned = $3,
             total_paid = $4,
             total_pending = $5,
             total_reversed = $6,
             transaction_count = $7,
             last_updated = CURRENT_TIMESTAMP`,
          [
            agentUserId,
            landlordUserId,
            earning.total_earned || 0,
            earning.total_paid || 0,
            earning.total_pending || 0,
            earning.total_reversed || 0,
            earning.transaction_count || 0,
          ]
        );
      }
    } catch (error) {
      logger.error(`Error updating earnings summary: ${error.message}`);
      throw error;
    }
  }

  /**
   * Log audit trail for commission actions
   */
  static async logAuditTrail(agentUserId, actionType, affectedCommissionId, oldValues, newValues, performedByUserId) {
    try {
      await db.query(
        `INSERT INTO agent_commission_audit 
         (agent_user_id, action_type, affected_commission_id, old_values, new_values, performed_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [agentUserId, actionType, affectedCommissionId, JSON.stringify(oldValues), JSON.stringify(newValues), performedByUserId]
      );
    } catch (error) {
      logger.error(`Error logging audit trail: ${error.message}`);
      // Don't throw - audit logging shouldn't fail the main operation
    }
  }
}

module.exports = AgentCommissionService;
