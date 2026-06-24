const db = require('../config/middleware/database');

exports.getComplianceOverview = async (req, res) => {
  try {

    const totalOpen = await db.query(
      `SELECT COUNT(*) FROM disputes WHERE status = 'open'`
    );

    const escalated = await db.query(
      `SELECT COUNT(*) FROM disputes WHERE escalated = TRUE`
    );

    const aging = await db.query(
      `SELECT COUNT(*) FROM disputes
       WHERE status = 'open'
       AND created_at <= NOW() - INTERVAL '14 days'`
    );

    const withoutEvidence = await db.query(
      `SELECT COUNT(*) FROM disputes d
       LEFT JOIN dispute_evidence e ON d.id = e.dispute_id
       WHERE e.id IS NULL`
    );

    const lawyerActivity = await db.query(
      `SELECT COUNT(*) FROM audit_logs
       WHERE action ILIKE '%lawyer%'`
    );

    const ledgerStatus = await verifyLedgerIntegrityInternal();

    const riskScore =
      parseInt(aging.rows[0].count) * 2 +
      parseInt(escalated.rows[0].count) * 3 +
      parseInt(withoutEvidence.rows[0].count);

    res.json({
      success: true,
      data: {
        totalOpen: parseInt(totalOpen.rows[0].count),
        escalated: parseInt(escalated.rows[0].count),
        aging: parseInt(aging.rows[0].count),
        withoutEvidence: parseInt(withoutEvidence.rows[0].count),
        lawyerActivity: parseInt(lawyerActivity.rows[0].count),
        ledgerIntegrity: ledgerStatus,
        riskScore
      }
    });

  } catch (error) {
    console.error('Compliance overview error:', error);
    res.status(500).json({
      success: false,
      message: 'Compliance overview failed'
    });
  }
};


// Internal ledger check (no route exposure)
const verifyLedgerIntegrityInternal = async () => {
  try {
    const logs = await db.query(
      `SELECT * FROM audit_logs ORDER BY id ASC`
    );

    let previousHash = 'GENESIS';

    for (const log of logs.rows) {
      const dataString =
        log.actor_id +
        log.action +
        log.target_type +
        log.target_id +
        log.created_at.toISOString() +
        previousHash;

      const recalculated = require('crypto')
        .createHash('sha256')
        .update(dataString)
        .digest('hex');

      if (recalculated !== log.current_hash) {
        return false;
      }

      previousHash = log.current_hash;
    }

    return true;

  } catch (error) {
    return false;
  }
};

exports.getRiskTrend = async (req, res) => {
  try {

    const result = await db.query(`
      SELECT 
        DATE(created_at) as day,
        COUNT(*) FILTER (WHERE status = 'open') * 2 +
        COUNT(*) FILTER (WHERE escalated = TRUE) * 3 AS risk_score
      FROM disputes
      GROUP BY DATE(created_at)
      ORDER BY day ASC
    `);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Risk trend error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch risk trend'
    });
  }
};