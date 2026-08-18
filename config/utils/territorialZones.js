const ZONE_STATES = Object.freeze({
  'North Central': ['Benue', 'FCT', 'Kogi', 'Kwara', 'Nasarawa', 'Niger', 'Plateau'],
  'North East': ['Adamawa', 'Bauchi', 'Borno', 'Gombe', 'Taraba', 'Yobe'],
  'North West': ['Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Sokoto', 'Zamfara'],
  'South East': ['Abia', 'Anambra', 'Ebonyi', 'Enugu', 'Imo'],
  'South South': ['Akwa Ibom', 'Bayelsa', 'Cross River', 'Delta', 'Edo', 'Rivers'],
  'South West': ['Ekiti', 'Lagos', 'Ogun', 'Ondo', 'Osun', 'Oyo'],
});
const ZONES = Object.freeze(Object.keys(ZONE_STATES));
const normalized = (value) => String(value || '').trim().toLowerCase();
const canonicalZone = (value) => ZONES.find((zone) => normalized(zone) === normalized(value)) || null;
const zoneForState = (state) => ZONES.find((zone) => ZONE_STATES[zone].some((item) => normalized(item) === normalized(state))) || null;
const zoneContainsState = (zone, state) => canonicalZone(zone) === zoneForState(state);
module.exports = { ZONES, ZONE_STATES, canonicalZone, zoneForState, zoneContainsState };
