// Voice read-scope resolver for the geo support line (Phase 0/1).
//
// Tiers mirror the ladder in docs/geo-support-escalation-design.md:
//   super  -> super_admin / super_support_admin      (sees everything)
//   state  -> state_support_admin / state_admin      (sees one assigned_state)
//   lga    -> lga_support_admin / lga_admin          (sees one assigned_lga)
//
// Scope fields: LGA is taken from `assigned_lga` when present, else from
// `assigned_city` (the support-ticket convention already uses assigned_city
// as the LGA). Reads filter rows on the jurisdiction_* columns added by
// migration 142; legacy rows with NULL jurisdiction are super-tier only.

const SUPER_ADMIN = 'super_admin';
const SUPER_SUPPORT = 'super_support_admin';
const STATE_SUPPORT = 'state_support_admin';
const LGA_SUPPORT = 'lga_support_admin';
const STATE_ADMIN = 'state_admin';
const LGA_ADMIN = 'lga_admin';

const VOICE_READ_ROLES = [
  SUPER_ADMIN,
  SUPER_SUPPORT,
  STATE_SUPPORT,
  LGA_SUPPORT,
  STATE_ADMIN,
  LGA_ADMIN,
];

const isVoiceReadRole = (role) => VOICE_READ_ROLES.includes(role);

// Resolves the scope for an authenticated voice reader. Throws a 403-shaped
// Error when the user is not allowed or is missing their assigned area.
const resolveVoiceReadScope = (user) => {
  const role = user && user.user_type;
  if (!isVoiceReadRole(role)) {
    const error = new Error('Your role cannot view voice records.');
    error.statusCode = 403;
    throw error;
  }

  if (role === SUPER_ADMIN || role === SUPER_SUPPORT) {
    return { level: 'super', state: null, lga: null };
  }

  const state = String(user.assigned_state || '').trim();
  const lga = String(user.assigned_lga || user.assigned_city || '').trim();

  if (role === STATE_SUPPORT || role === STATE_ADMIN) {
    if (!state) {
      const error = new Error('Your state is not assigned yet.');
      error.statusCode = 403;
      throw error;
    }
    return { level: 'state', state, lga: null };
  }

  // lga_support_admin / lga_admin
  if (!lga) {
    const error = new Error('Your LGA is not assigned yet.');
    error.statusCode = 403;
    throw error;
  }
  return { level: 'lga', state, lga };
};

// Returns a SQL fragment (with positional params) that constrains a voice
// record query to the reader's tier. `alias` prefixes the jurisdiction_*
// columns (e.g. 'latest' for a DISTINCT ON subquery).
const buildScopeClause = (scope, alias) => {
  const prefix = alias ? `${alias}.` : '';
  if (!scope || scope.level === 'super') return { clause: '', params: [] };

  const lower = (col) => `LOWER(TRIM(${prefix}${col}))`;

  if (scope.level === 'state') {
    return {
      clause: ` AND ${lower('jurisdiction_state')} = LOWER(TRIM($1))`,
      params: [scope.state],
    };
  }
  return {
    clause:
      ` AND ${lower('jurisdiction_state')} = LOWER(TRIM($1))` +
      ` AND ${lower('jurisdiction_lga')} = LOWER(TRIM($2))`,
    params: [scope.state, scope.lga],
  };
};

module.exports = {
  VOICE_READ_ROLES,
  isVoiceReadRole,
  resolveVoiceReadScope,
  buildScopeClause,
};
