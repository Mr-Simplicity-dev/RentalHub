import db from '../db/index.js';

export const runFraudScan = async () => {
  // Rule: users with >=3 open reports
  const reportedUsers = await db.query(`
    SELECT target_id, COUNT(*) c
    FROM reports
    WHERE target_type = 'user' AND status = 'open'
    GROUP BY target_id
    HAVING COUNT(*) >= 3
  `);

  for (const r of reportedUsers.rows) {
    await db.query(
      `INSERT INTO fraud_flags (entity_type, entity_id, rule, score)
       VALUES ('user', $1, 'MULTIPLE_REPORTS', $2)
       ON CONFLICT DO NOTHING`,
      [r.target_id, r.c]
    );
  }

  // Rule: properties with unrealistic rent (example < 20k)
  const cheapProps = await db.query(`
    SELECT id FROM properties WHERE rent < 20000
  `);

  for (const p of cheapProps.rows) {
    await db.query(
      `INSERT INTO fraud_flags (entity_type, entity_id, rule, score)
       VALUES ('property', $1, 'SUSPICIOUS_PRICE', 1)
       ON CONFLICT DO NOTHING`,
      [p.id]
    );
  }
};
