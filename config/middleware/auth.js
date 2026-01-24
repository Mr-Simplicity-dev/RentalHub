const jwt = require('jsonwebtoken');
const db = require('./database');

// Verify JWT Token
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('AUTH HEADER:', authHeader);

    const token = authHeader?.split(' ')[1];
    console.log('TOKEN:', token);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('DECODED JWT:', decoded);

    const userId = decoded.userId || decoded.id || decoded.user_id;
    console.log('USER ID:', userId);


    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.',
      });
    }

    const result = await db.query(
      'SELECT id, email, user_type, identity_verified, subscription_active FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. User not found.',
      });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token.',
    });
  }
};

// Check if user is a landlord
exports.isLandlord = (req, res, next) => {
  if (req.user.user_type !== 'landlord') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Landlords only.',
    });
  }
  next();
};

// Check if user is a tenant
exports.isTenant = (req, res, next) => {
  if (req.user.user_type !== 'tenant') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Tenants only.',
    });
  }
  next();
};

// Check if user is verified
exports.isVerified = (req, res, next) => {
  if (!req.user.identity_verified) {
    return res.status(403).json({
      success: false,
      message: 'Please complete identity verification (NIN + Passport) first.',
    });
  }
  next();
};

// Check if tenant has active subscription
exports.hasActiveSubscription = (req, res, next) => {
  if (req.user.user_type === 'tenant' && !req.user.subscription_active) {
    return res.status(403).json({
      success: false,
      message: 'Please subscribe to access property details.',
    });
  }
  next();
};

// Check for super admin
export const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Super admin access only' });
  }
  next();
};
