const { ROLE_GROUPS, roleIn } = require('../utils/roleHierarchy');

module.exports.requireStateAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!roleIn(req.user.user_type, ROLE_GROUPS.stateOperations)) {
    return res.status(403).json({
      success: false,
      message: 'State Admin access only',
    });
  }

  next();
};
