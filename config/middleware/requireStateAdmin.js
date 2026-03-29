module.exports.requireStateAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.user_type !== 'state_admin') {
    return res.status(403).json({
      success: false,
      message: 'State Admin access only',
    });
  }

  next();
};