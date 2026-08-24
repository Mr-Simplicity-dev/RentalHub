const { isZonalAdmin } = require('../utils/roleScopes');
module.exports.requireZonalAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!isZonalAdmin(req.user.user_type)) return res.status(403).json({ success: false, message: 'Zonal Admin access only' });
  next();
};
