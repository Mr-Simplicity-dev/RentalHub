// Caller home-area resolution for the geo support line (Phase 1 capture).
//
// Rule B (docs/geo-support-escalation-design.md): for a KNOWN user the call is
// routed/recorded against their HOME area, not where they are calling from.
// The best available home-area signal on a regular user is
// `preferred_lga_name` + `preferred_state_id` (joined to `states`). This is an
// approximation until a stronger "home LGA" source (profile address / the LGA
// of the property being called about) is introduced.

const db = require('../config/middleware/database');

const toDigits = (value) => String(value || '').replace(/\D/g, '');

// Resolves { state, lga, source: 'account' } for a caller whose phone matches
// a known user with a preferred state+LGA; otherwise null (source 'unknown').
const resolveCallerArea = async (rawPhone) => {
  const digits = toDigits(rawPhone);
  if (digits.length < 7) return null;
  try {
    const result = await db.query(
      `SELECT s.state_name, u.preferred_lga_name AS lga_name
       FROM users u
       LEFT JOIN states s ON s.id = u.preferred_state_id
       WHERE u.deleted_at IS NULL
         AND u.phone IS NOT NULL
         AND regexp_replace(u.phone, '\D', '', 'g') = $1
       LIMIT 1`,
      [digits]
    );
    const row = result.rows[0];
    const state = String(row?.state_name || '').trim();
    const lga = String(row?.lga_name || '').trim();
    if (!state || !lga) return null;
    return { state, lga, source: 'account' };
  } catch {
    return null;
  }
};

module.exports = { resolveCallerArea, toDigits };
