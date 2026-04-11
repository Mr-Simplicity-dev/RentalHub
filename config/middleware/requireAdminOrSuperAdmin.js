module.exports.requireAdminOrSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (!['admin', 'super_admin', 'state_admin', 'state_financial_admin'].includes(req.user.user_type)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access only',
    });
  }

  next();
};
