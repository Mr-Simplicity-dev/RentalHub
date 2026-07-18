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

const ensureMobileAnalyticsSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mobile_analytics_events (
      id SERIAL PRIMARY KEY,
      event_name VARCHAR(120) NOT NULL,
      screen VARCHAR(160),
      platform VARCHAR(40),
      app_version VARCHAR(80),
      session_id VARCHAR(120),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_mobile_analytics_events_name_created
      ON mobile_analytics_events(event_name, created_at DESC)
  `);
};

const parseVersion = (value = '') =>
  String(value)
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));

const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const platformStoreUrl = (platform) => {
  if (platform === 'ios') {
    return process.env.MOBILE_IOS_STORE_URL || process.env.MOBILE_STORE_URL || '';
  }
  return process.env.MOBILE_ANDROID_STORE_URL || process.env.MOBILE_STORE_URL || '';
};

const platformApkUrl = (platform) => {
  if (platform !== 'android') return '';
  return (
    process.env.MOBILE_ANDROID_APK_URL ||
    process.env.MOBILE_APK_URL ||
    ''
  );
};

const platformUpdateUrl = (platform) =>
  platformApkUrl(platform) || platformStoreUrl(platform);

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

router.post(
  '/analytics/events',
  [
    body('event_name').isString().trim().isLength({ min: 2, max: 120 }),
    body('screen').optional().isString().trim().isLength({ max: 160 }),
    body('platform').optional().isString().trim().isLength({ max: 40 }),
    body('app_version').optional().isString().trim().isLength({ max: 80 }),
    body('session_id').optional().isString().trim().isLength({ max: 120 }),
    body('metadata').optional().isObject(),
  ],
  validateRequest,
  async (req, res) => {
    try {
      await ensureMobileAnalyticsSchema();
      const {
        event_name,
        screen = null,
        platform = null,
        app_version = null,
        session_id = null,
        metadata = {},
      } = req.body;

      const result = await db.query(
        `INSERT INTO mobile_analytics_events
          (event_name, screen, platform, app_version, session_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, created_at`,
        [
          event_name,
          screen,
          platform,
          app_version,
          session_id,
          JSON.stringify({
            ...metadata,
            user_agent: req.get('User-Agent') || null,
          }),
        ]
      );

      return res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
      req.logger?.error?.('Mobile analytics event error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to save mobile analytics event',
      });
    }
  }
);

router.get('/app-version', (req, res) => {
  const platform = String(req.query.platform || '').toLowerCase();
  const currentVersion = String(req.query.version || '').trim();
  const latestVersion =
    process.env.MOBILE_LATEST_VERSION ||
    process.env.MOBILE_ANDROID_LATEST_VERSION ||
    '1.0.2';
  const minimumVersion =
    process.env.MOBILE_MINIMUM_VERSION ||
    process.env.MOBILE_ANDROID_MINIMUM_VERSION ||
    '1.0.0';

  const updateAvailable = currentVersion
    ? compareVersions(currentVersion, latestVersion) < 0
    : false;
  const updateRequired = currentVersion
    ? compareVersions(currentVersion, minimumVersion) < 0
    : false;

  return res.json({
    success: true,
    data: {
      current_version: currentVersion || null,
      latest_version: latestVersion,
      minimum_version: minimumVersion,
      update_available: updateAvailable,
      update_required: updateRequired,
      platform: platform || null,
      store_url: platformStoreUrl(platform),
      download_url: platformUpdateUrl(platform),
      apk_url: platformApkUrl(platform),
      message: updateRequired
        ? 'A required app update is available.'
        : updateAvailable
          ? 'A newer app version is available.'
          : 'Your app is up to date.',
    },
  });
});

module.exports = router;
