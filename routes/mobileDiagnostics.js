const express = require('express');
const { body } = require('express-validator');
const validateRequest = require('../config/middleware/validateRequest');
const db = require('../config/middleware/database');

const router = express.Router();

const ensureMobileCrashSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mobile_crash_reports (
      id SERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      component_stack TEXT,
      platform VARCHAR(40),
      app_version VARCHAR(80),
      route_name VARCHAR(120),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

router.post(
  '/diagnostics/crash',
  [
    body('message').isString().trim().isLength({ min: 1, max: 2000 }),
    body('stack').optional().isString().isLength({ max: 12000 }),
    body('component_stack').optional().isString().isLength({ max: 12000 }),
    body('platform').optional().isString().trim().isLength({ max: 40 }),
    body('app_version').optional().isString().trim().isLength({ max: 80 }),
    body('route_name').optional().isString().trim().isLength({ max: 120 }),
    body('metadata').optional().isObject(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      await ensureMobileCrashSchema();
      const {
        message,
        stack = null,
        component_stack = null,
        platform = null,
        app_version = null,
        route_name = null,
        metadata = {},
      } = req.body;

      const result = await db.query(
        `INSERT INTO mobile_crash_reports
          (message, stack, component_stack, platform, app_version, route_name, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, created_at`,
        [
          message,
          stack,
          component_stack,
          platform,
          app_version,
          route_name,
          JSON.stringify({
            ...metadata,
            user_agent: req.get('User-Agent') || null,
          }),
        ]
      );

      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      req.logger?.error?.('Mobile crash report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save crash report',
      });
    }
  }
);

module.exports = router;
