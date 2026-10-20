/**
 * Nigerian state names are written inconsistently across the platform:
 * "FCT" in one row, "Federal Capital Territory" in another. Ticket auto-assign
 * and notification targeting compare state names as text, so the two spellings
 * never matched and FCT tickets could not be routed.
 *
 * normalizeStateName() collapses a name to a single comparable key.
 */

const ALIASES = new Map([
  ['fct', 'federal capital territory'],
  ['abuja', 'federal capital territory'],
  ['federal capital territory', 'federal capital territory'],
  ['federal capital territory fct', 'federal capital territory'],
  ['nas', 'nasarawa'],
  ['nasarawa', 'nasarawa'],
  ['akwa ibom', 'akwa ibom'],
  ['akwa-ibom', 'akwa ibom'],
  ['cross river', 'cross river'],
  ['cross-river', 'cross river'],
]);

exports.normalizeStateName = (value) => {
  const base = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/state$/i, '')
    .trim();

  return ALIASES.get(base) || base;
};

exports.statesMatch = (a, b) => {
  const left = exports.normalizeStateName(a);
  const right = exports.normalizeStateName(b);
  return Boolean(left) && left === right;
};
