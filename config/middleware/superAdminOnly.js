module.exports = function superAdminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.user.user_type !== 'super_admin') {
    return res.status(403).json({
      message: 'Only Super Admin can perform this action'
    });
  }

  next();
};