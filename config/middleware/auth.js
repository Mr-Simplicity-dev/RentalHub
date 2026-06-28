const jwt = require('jsonwebtoken');
const db = require('./database');
const { getAuthTokenFromRequest } = require('../utils/authCookies');

let userSuspensionSchemaReady = false;

const ensureUserSuspensionSchema = async () => {
  return Promise.resolve();
};

// Verify JWT Token
const authenticate = async (req, res, next) => {
  try {
    await ensureUserSuspensionSchema();

    const token = getAuthTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    const userId = decoded.userId || decoded.id || decoded.user_id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.',
      });
    }

    const result = await db.query(
      `SELECT id, email, user_type, identity_verified, subscription_active,
              assigned_state, assigned_city,
              preferred_state_id, preferred_lga_name,
              deleted_at, is_active,
              account_suspended_reason
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
      });
    }

    const currentUser = result.rows[0];

    if (currentUser.deleted_at) {
      return res.status(403).json({
        success: false,
        message: 'Account deleted. Please contact support.',
      });
    }

    if (currentUser.is_active === false) {
      const reason = String(currentUser.account_suspended_reason || '').trim();
      return res.status(403).json({
        success: false,
        message: reason
          ? `Account suspended: ${reason}`
          : 'Account suspended. Please contact support.',
      });
    }

    req.auth = decoded;
    req.user = currentUser;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    await ensureUserSuspensionSchema();

    const token = getAuthTokenFromRequest(req);

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    const userId = decoded.userId || decoded.id || decoded.user_id;

    if (!userId) {
      return next();
    }

    const result = await db.query(
      `SELECT id, email, user_type, identity_verified, subscription_active,
              assigned_state, assigned_city,
              preferred_state_id, preferred_lga_name,
              deleted_at, is_active,
              account_suspended_reason
       FROM users
       WHERE id = $1`,
      [userId]
    );

    const currentUser = result.rows[0];

    if (
      currentUser &&
      !currentUser.deleted_at &&
      currentUser.is_active !== false
    ) {
      req.auth = decoded;
      req.user = currentUser;
    }

    return next();
  } catch {
    return next();
  }
};

// Check if user is a landlord
const isLandlord = (req, res, next) => {
  if (req.user.user_type !== 'landlord') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Landlords only.',
    });
  }
  next();
};

// Check if user is a tenant
const isTenant = (req, res, next) => {
  if (req.user.user_type !== 'tenant') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Tenants only.',
    });
  }
  next();
};

// Check if user is verified
const isVerified = (req, res, next) => {
  if (!req.user.identity_verified) {
    return res.status(403).json({
      success: false,
      message: 'Please complete identity verification (NIN + Passport) first.',
    });
  }
  next();
};

// Check if tenant has active subscription
const hasActiveSubscription = (req, res, next) => {
  if (req.user.user_type === 'tenant' && !req.user.subscription_active) {
    return res.status(403).json({
      success: false,
      message: 'Please subscribe to access property details.',
    });
  }
  next();
};

// Check for super admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.user_type !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access only' });
  }
  next();
};

// Check if user is admin OR super admin
const requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!['admin', 'lga_admin', 'super_admin', 'state_admin', 'state_financial_admin'].includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Super Admin only.',
    });
  }

  next();
};

const isLandlordOrAgent = (req, res, next) => {
  if (!['landlord', 'agent'].includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Landlords or assigned agents only.',
    });
  }
  next();
};

module.exports = {
  authenticate,
  optionalAuthenticate,
  isLandlord,
  isLandlordOrAgent,
  isTenant,
  isVerified,
  hasActiveSubscription,
  requireSuperAdmin,
  requireAdminOrSuperAdmin,
};
