module.exports.requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.user_type !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Super Admin access only',
    });
  }

  next();
};