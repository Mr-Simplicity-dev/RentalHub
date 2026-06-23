const { isStateFinancialAdmin } = require('../utils/roleScopes');

module.exports.requireStateAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!isStateFinancialAdmin(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'State Financial Admin access only',
    });
  }

  next();
};