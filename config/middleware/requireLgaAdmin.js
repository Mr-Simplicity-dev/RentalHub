const { isLgaAdmin } = require('../utils/roleScopes');

module.exports.requireLgaAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!isLgaAdmin(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'LGA Admin access only',
    });
  }

  next();
};