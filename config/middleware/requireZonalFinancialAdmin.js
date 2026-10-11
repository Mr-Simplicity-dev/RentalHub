const { roleIn } = require('../utils/roleHierarchy');
module.exports.requireZonalFinancialAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!roleIn(req.user.user_type, ['zonal_financial_admin', 'zonal_admin'])) {
    return res.status(403).json({ success: false, message: 'Zonal Financial Admin access only' });
  }
  next();
};
