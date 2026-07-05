const express = require('express');
const db = require('../config/middleware/database');
const { authenticate } = require('../config/middleware/auth');

const router = express.Router();

const SUPPORT_ADMIN_ROLES = new Set([
  'super_admin',
  'super_support_admin',
  'state_support_admin',
  'lga_support_admin',
]);

let systemAlertSchemaReady = false;

const ensureSystemAlertSchema = async () => {
  if (systemAlertSchemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS system_alerts (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      severity VARCHAR(20) NOT NULL DEFAULT 'info',
      source VARCHAR(80) NOT NULL DEFAULT 'system',
      resolution TEXT,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_system_alerts_active
      ON system_alerts(is_resolved, severity, created_at DESC);
  `);

  systemAlertSchemaReady = true;
};

const requireSupportAdmin = (req, res, next) => {
  const role = String(req.user?.user_type || '').toLowerCase();
  if (SUPPORT_ADMIN_ROLES.has(role)) return next();

  return res.status(403).json({
    success: false,
    message: 'Support admin access required',
  });
};

router.get('/alerts', authenticate, requireSupportAdmin, async (req, res) => {
  try {
    await ensureSystemAlertSchema();

    const result = await db.query(
      `SELECT id, title, description, severity, source, resolution, created_at, resolved_at
       FROM system_alerts
       WHERE is_resolved = FALSE
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'warning' THEN 2
           ELSE 3
         END,
         created_at DESC
       LIMIT 100`
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    req.logger.error('System alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system alerts',
    });
  }
});

module.exports = router;
