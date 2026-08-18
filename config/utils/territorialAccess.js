const { normalizeRole } = require('./roleHierarchy');
const { canonicalZone, zoneContainsState } = require('./territorialZones');
const normalized = (value) => String(value || '').trim().toLowerCase();

const canAccessTerritory = (user, target = {}) => {
  const role = normalizeRole(user?.user_type || user?.userType);
  if (role === 'super_admin') return true;
  if (role === 'zonal_admin') {
    return Boolean(canonicalZone(user?.assigned_zone) && target.state && zoneContainsState(user.assigned_zone, target.state));
  }
  if (role === 'state_admin') {
    return Boolean(user?.assigned_state && target.state && normalized(user.assigned_state) === normalized(target.state));
  }
  if (role === 'lga_admin') {
    return Boolean(user?.assigned_state && user?.assigned_city && target.state && target.lga
      && normalized(user.assigned_state) === normalized(target.state)
      && normalized(user.assigned_city) === normalized(target.lga));
  }
  return false;
};

module.exports = { canAccessTerritory };
