const db = require('../config/middleware/database');

const ESCALATION_DAYS = 14;

exports.checkAndEscalateDisputes = async () => {
  try {
    const result = await db.query(
      `
      UPDATE disputes
      SET escalated = TRUE,
          escalated_at = CURRENT_TIMESTAMP
      WHERE status = 'open'
      AND escalated = FALSE
      AND created_at <= NOW() - INTERVAL '${ESCALATION_DAYS} days'
      RETURNING id, property_id
      `
    );

    if (result.rows.length > 0) {
      console.log(`Escalated ${result.rows.length} dispute(s)`);

      for (const dispute of result.rows) {
        await db.query(
          `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
           VALUES ($1,$2,$3,$4)`,
          [null, 'Auto escalated dispute', 'dispute', dispute.id]
        );
      }
    }

  } catch (error) {
    console.error('Escalation engine error:', error);
  }
};