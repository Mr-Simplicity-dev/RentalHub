const { ROLE_GROUPS, roleIn } = require('../utils/roleHierarchy');
module.exports.requireZonalAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!roleIn(req.user.user_type, ROLE_GROUPS.zonalOperations)) return res.status(403).json({ success: false, message: 'Zonal Admin access only' });
  next();
};
