const jwt = require('jsonwebtoken');
const db = require('./database');
const {
  evaluateRegistrationAccess,
  isGlobalRegistrationEnabled,
} = require('../utils/registrationAccess');
const { getAuthTokenFromRequest } = require('../utils/authCookies');

const DEFAULT_FEATURE_FLAGS = [
  {
    key: 'allow_applications',
    enabled: true,
    description: 'Allow tenants to submit applications.',
  },
  {
    key: 'allow_property_posting',
    enabled: true,
    description: 'Allow landlords to create new property listings.',
  },
  {
    key: 'allow_registration',
    enabled: true,
    description: 'Master switch for all registration. When off, tenant and landlord registration are disabled.',
  },
  {
    key: 'allow_tenant_registration',
    enabled: true,
    description: 'Allow tenant registration when the master registration switch is on.',
  },
  {
    key: 'allow_landlord_registration',
    enabled: true,
    description: 'Allow landlord registration when the master registration switch is on.',
  },
  {
    key: 'maintenance_mode',
    enabled: false,
    description: 'Restrict the platform to super admin access only.',
  },
  {
    key: 'nin_number',
    enabled: true,
    description: 'Require and allow NIN collection for local registrations.',
  },
  {
    key: 'passport_number',
    enabled: true,
    description: 'Require and allow passport collection for foreign registrations.',
  },
  {
    key: 'tenant_registration_payment',
    enabled: false,
    description: 'Require ₦3,000 payment before tenant account creation.',
  },
  {
    key: 'landlord_registration_payment',
    enabled: false,
    description: 'Require N5,000 payment before landlord account creation.',
  },
  {
    key: 'property_alert_payment',
    enabled: false,
    description: 'Require N5,000 payment before processing "Notify me when available" requests.',
  },
  {
    key: 'ads_enabled',
    enabled: true,
    description: 'Show Super Admin managed ads on Home, Dashboard, and Properties pages.',
  },
  {
    key: 'tenant_landlord_referrals',
    enabled: true,
    description: 'Allow tenants and landlords to earn N1,000 subscription credit for successful referral registrations.',
  },
];

let featureFlagsReady = false;

const syncDefaultFeatureFlags = async () => {
  await Promise.all(
    DEFAULT_FEATURE_FLAGS.map((flag) =>
      db.query(
        `INSERT INTO feature_flags (key, enabled, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (key)
         DO UPDATE SET description = EXCLUDED.description`,
        [flag.key, flag.enabled, flag.description]
      )
    )
  );
};

const ensureFeatureFlagsTable = async (options = {}) => {
  const { syncDefaults = false } = options;
  let shouldSyncDefaults = syncDefaults;

  if (!featureFlagsReady) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS feature_flags (
        key VARCHAR(100) PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    featureFlagsReady = true;
    shouldSyncDefaults = true;
  }

  if (shouldSyncDefaults) {
    await syncDefaultFeatureFlags();
    await migrateLegacyRegistrationFlags();
  }
};

const migrateLegacyRegistrationFlags = async () => {
  await db.query(`
    INSERT INTO feature_flags (key, enabled, description)
    SELECT
      'allow_tenant_registration',
      enabled,
      'Allow new tenants to register.'
    FROM feature_flags
    WHERE key = 'allow_registration'
    ON CONFLICT (key) DO NOTHING
  `);

  await db.query(`
    INSERT INTO feature_flags (key, enabled, description)
    SELECT
      'allow_landlord_registration',
      enabled,
      'Allow new landlords to register.'
    FROM feature_flags
    WHERE key = 'allow_registration'
    ON CONFLICT (key) DO NOTHING
  `);
};

const getFeatureFlagsMap = async () => {
  await ensureFeatureFlagsTable();

  const defaults = Object.fromEntries(
    DEFAULT_FEATURE_FLAGS.map((flag) => [flag.key, flag.enabled])
  );

  const { rows } = await db.query(`SELECT key, enabled FROM feature_flags`);

  return {
    ...defaults,
    ...Object.fromEntries(rows.map((row) => [row.key, row.enabled])),
  };
};

const attachUserFromToken = (req) => {
  if (req.user?.user_type) return;

  const token = getAuthTokenFromRequest(req);

  if (!token || !process.env.JWT_SECRET) return;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    req.user = {
      ...(req.user || {}),
      id: decoded.userId,
      user_type: decoded.userType,
    };
  } catch {
    // Ignore invalid tokens here; auth middleware will handle protected routes.
  }
};

const isMaintenanceBypassRoute = (req) => {
  const path = req.path || '';

  const allowedExactRoutes = [
    '/auth/login',
    '/auth/me',
    '/auth/refresh',
  ];

  if (allowedExactRoutes.includes(path)) {
    return true;
  }

  // Allow super admin feature flag endpoints so super admin can turn maintenance off again.
  if (
    path.includes('/feature-flags') ||
    path.includes('/system/flags') ||
    path.includes('/admin/flags') ||
    path.includes('/super-admin/flags')
  ) {
    return true;
  }

  return false;
};

const enforceFlags = async (req, res, next) => {
  try {
    attachUserFromToken(req);

    const flags = await getFeatureFlagsMap();

    if (
      flags.maintenance_mode &&
      req.user?.user_type !== 'super_admin' &&
      !isMaintenanceBypassRoute(req)
    ) {
      return res.status(503).json({
        message: 'System under maintenance. Please come back in a few hours.',
      });
    }

    const isDirectRegistrationRequest =
      req.method === 'POST' && req.path === '/auth/register';
    const isRegistrationPaymentInitRequest =
      req.method === 'POST' &&
      (
        req.path === '/auth/register/payment' ||
        req.path === '/auth/register/tenant-payment'
      );

    if (isDirectRegistrationRequest || isRegistrationPaymentInitRequest) {
      const body = req.body || {};
      const registrationUserType = String(body.user_type || '').trim().toLowerCase();

      if (!['tenant', 'landlord'].includes(registrationUserType)) {
        return res.status(400).json({ message: 'Registration user type must be tenant or landlord' });
      }

      if (!flags.allow_registration) {
        return res.status(403).json({ message: 'Registration disabled' });
      }

      if (!isGlobalRegistrationEnabled(flags, registrationUserType)) {
        return res.status(403).json({
          message:
            registrationUserType === 'tenant'
              ? 'Tenant registration disabled'
              : 'Landlord registration disabled',
        });
      }

      try {
        const access = await evaluateRegistrationAccess({
          userType: registrationUserType,
          flags,
          stateId: body.state_id,
          lgaName: body.lga_name,
        });

        if (!access.allowed) {
          return res.status(403).json({
            message: access.message || 'Registration disabled for this location',
          });
        }
      } catch (error) {
        console.error('Registration access evaluation error:', error);
        return res.status(500).json({ message: 'Failed to validate registration access' });
      }
    }

    if (!flags.allow_property_posting && req.path.includes('/properties') && req.method === 'POST') {
      return res.status(403).json({ message: 'Property posting disabled' });
    }

    if (!flags.allow_applications && req.path.includes('/applications') && req.method === 'POST') {
      return res.status(403).json({ message: 'Applications disabled' });
    }

    if (!flags.nin_number && req.path.includes('/nin') && req.method === 'POST') {
      return res.status(403).json({ message: 'NIN disabled' });
    }

    if (!flags.passport_number && req.path.includes('/passport') && req.method === 'POST') {
      return res.status(403).json({ message: 'Passport disabled' });
    }

    if (isDirectRegistrationRequest || isRegistrationPaymentInitRequest) {
      const body = req.body || {};
      const isForeigner =
        body.is_foreigner === true ||
        body.is_foreigner === 'true' ||
        body.is_foreigner === 1 ||
        body.is_foreigner === '1';
      const hasNIN = !!String(body.nin || '').trim();
      const hasPassport = !!String(body.international_passport_number || '').trim();

      if (!flags.nin_number && !isForeigner && hasNIN) {
        return res.status(403).json({ message: 'NIN disabled' });
      }

      if (!flags.passport_number && isForeigner && hasPassport) {
        return res.status(403).json({ message: 'Passport disabled' });
      }
    }

    next();
  } catch (error) {
    console.error('Feature flag enforcement error:', error);
    res.status(500).json({ message: 'Failed to enforce feature flags' });
  }
};

module.exports = {
  DEFAULT_FEATURE_FLAGS,
  ensureFeatureFlagsTable,
  syncDefaultFeatureFlags,
  getFeatureFlagsMap,
  enforceFlags,
};
