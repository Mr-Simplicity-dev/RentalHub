const {
  isSuperFinancialAdmin,
  isSuperAdminOrSuperFinancialAdmin,
} = require('../utils/roleScopes');

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