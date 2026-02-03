module.exports.requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!['admin', 'super_admin'].includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Admin or Super Admin access only',
    });
  }

  next();
};
