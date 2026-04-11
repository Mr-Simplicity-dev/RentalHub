exports.requireAdmin = (req, res, next) => {
  const type =
    req.user?.userType ||   // from JWT payload
    req.user?.user_type;    // from DB-attached user

  if (!['admin', 'state_admin', 'state_financial_admin'].includes(type)) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required',
    });
  }

  next();
};
