const db = require('./database');
const {
  isSuperFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
} = require('../utils/roleScopes.js work on it');

module.exports.requireFinancialAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!isSuperFinancialAdmin(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Super Financial Admin access only',
    });
  }

  next();
};
module.exports.requireSuperAdminOrDelegatedDirectWithdraw = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.user_type === 'super_admin') {
    return next();
  }

  if (req.user.user_type === 'super_financial_admin') {
    const perm = await db.query(
      `SELECT can_direct_withdraw FROM sfa_delegation_permissions WHERE super_financial_admin_id = $1`,
      [req.user.id]
    );

    if (perm.rows[0]?.can_direct_withdraw) {
      return next();
    }
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Super Admin or delegated direct withdrawal permission required.',
  });
};
module.exports.requireSuperAdminOrSuperFinancialAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!isSuperAdminOrSuperFinancialAdmin(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Super Admin or Super Financial Admin access only',
    });
  }

  next();
};