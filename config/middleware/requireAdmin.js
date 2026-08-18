const { GENERAL_ADMIN_ROLES, normalizeRole } = require('../utils/roleHierarchy');

exports.requireAdmin = (req, res, next) => {
  const type =
    req.user?.userType ||   // from JWT payload
    req.user?.user_type;    // from DB-attached user

  if (normalizeRole(type) === 'zonal_admin') {
    return res.status(403).json({ success: false, message: 'This endpoint is not yet zone-scoped' });
  }

  if (!GENERAL_ADMIN_ROLES.includes(normalizeRole(type))) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
};
