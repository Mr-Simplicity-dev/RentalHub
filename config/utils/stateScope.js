const normalizeState = (value) => String(value || '').trim().toLowerCase();

const statesMatch = (a, b) => {
  const left = normalizeState(a);
  const right = normalizeState(b);
  return Boolean(left) && Boolean(right) && left === right;
};

module.exports = {
  normalizeState,
  statesMatch,
};
