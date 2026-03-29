module.exports.requireFinancialAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.user_type !== 'financial_admin') {
    return res.status(403).json({
      success: false,
      message: 'Financial Admin access only',
    });
  }

  next();
};