const { zoneContainsState, canonicalZone } = require('./territorialZones');

const normalizeState = (value) => String(value || '').trim().toLowerCase();

const statesMatch = (a, b) => {
  const left = normalizeState(a);
  const right = normalizeState(b);
  return Boolean(left) && Boolean(right) && left === right;
};

const lawyerTerritoryMatches = (assignedState, assignedZone, propertyState) => {
  const zone = canonicalZone(assignedZone);
  if (zone) return zoneContainsState(zone, propertyState);
  return statesMatch(assignedState, propertyState);
};

module.exports = {
  normalizeState,
  statesMatch,
  lawyerTerritoryMatches,
};
