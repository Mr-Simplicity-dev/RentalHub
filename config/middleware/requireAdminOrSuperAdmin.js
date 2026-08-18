const { GENERAL_ADMIN_ROLES, normalizeRole } = require('../utils/roleHierarchy');

module.exports.requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (normalizeRole(req.user.user_type) === 'zonal_admin') {
    return res.status(403).json({ success: false, message: 'This endpoint is not yet zone-scoped' });
  }

  if (!GENERAL_ADMIN_ROLES.includes(normalizeRole(req.user.user_type))) {
    return res.status(403).json({
      success: false,
      message: 'Admin access only',
    });
  }

  next();
};
