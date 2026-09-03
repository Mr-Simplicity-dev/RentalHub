// Phase 2 routing-decision layer for the geo support line.
//
// Pure (no DB, no Twilio) so it is unit-testable and safe to ship before the
// LGA/state desks (Phase 3) and live Twilio exist. It decides WHICH tier owns
// a call given a captured jurisdiction and a duty roster; it does NOT touch
// TwiML. Wire-up order in docs/geo-support-escalation-design.md:
//   Phase 1 (done) captured jurisdiction; this layer decides; Phase 3 desks
//   publish duty; the voice flow then joins the chosen line/room.
//
// Feature flag `voice_geo_routing` (default OFF): when OFF the platform keeps
// today's single national super-support queue behaviour.

const TARGET = { LGA: 'lga', STATE: 'state', SUPER: 'super' };

const isGeoEnabled = (flags) => (flags && flags.voice_geo_routing) === true;

// Next tier up the geographic ladder; null at the top.
const rollUp = (tier) => {
  if (tier === TARGET.LGA) return TARGET.STATE;
  if (tier === TARGET.STATE) return TARGET.SUPER;
  return null;
};

// Picks the owning tier for a jurisdiction. duty flags say whether each tier
// currently has at least one staffed (Go-Available) line.
//   duty: { lga: bool, state: bool, super: bool }
const chooseRoutingTarget = (jurisdiction, duty = {}) => {
  const state = String(jurisdiction?.state || '').trim();
  const lga = String(jurisdiction?.lga || '').trim();

  if (duty.lga && state && lga) {
    return { tier: TARGET.LGA, state, lga, reason: null };
  }
  if (duty.state && state) {
    return { tier: TARGET.STATE, state, lga: null, reason: 'lga_unstaffed' };
  }
  if (duty.super) {
    return { tier: TARGET.SUPER, state: null, lga: null, reason: 'lower_tiers_unstaffed' };
  }
  return { tier: null, state: null, lga: null, reason: 'unstaffed' };
};

// Agent line/room identifier a tier joins while Go Available (Phase 3 wires
// the desks to these). `super` keeps today's national line.
const queueLineFor = (target) => {
  if (!target) return null;
  if (target.tier === TARGET.LGA) {
    return `queue:lga:${target.state}:${target.lga}`;
  }
  if (target.tier === TARGET.STATE) {
    return `queue:state:${target.state}`;
  }
  return 'queue:super';
};

// Ordered dispatch identities for a caller, honouring the geo ladder
// (LGA -> state -> super) and rolling up when an owning tier has nobody on
// duty. `identitiesByTier` = { lga: [], state: [], super: [] }. Returns the
// owning tier's pool, or the first lower-tier pool that is staffed, or [].
const dispatchIdentityOrder = (jurisdiction, identitiesByTier = {}) => {
  const lga = (identitiesByTier.lga || []).filter(Boolean);
  const state = (identitiesByTier.state || []).filter(Boolean);
  const sup = (identitiesByTier.super || []).filter(Boolean);

  const hasJurisdiction =
    Boolean(String(jurisdiction?.state || '').trim()) &&
    Boolean(String(jurisdiction?.lga || '').trim());

  const target = chooseRoutingTarget(hasJurisdiction ? jurisdiction : null, {
    lga: lga.length > 0,
    state: state.length > 0,
    super: sup.length > 0,
  });

  if (target.tier === TARGET.LGA && lga.length) return lga;
  if (target.tier === TARGET.STATE && state.length) return state;
  if (target.tier === TARGET.SUPER && sup.length) return sup;
  return [];
};

const normalizeKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Ownership rule (Phase 4): may an agent scope act on a call whose caller is
// in `callJurisdiction`? super acts anywhere; state only inside its state;
// LGA only inside its LGA. Calls with no captured jurisdiction may only be
// handled by super (lower tiers never pick them up).
const canAgentHandleJurisdiction = (agentScope, callJurisdiction) => {
  const level = agentScope && agentScope.level;
  if (level === 'super') return true;
  if (level !== 'state' && level !== 'lga') return false;

  const state = String(callJurisdiction?.state || '').trim();
  const lga = String(callJurisdiction?.lga || '').trim();
  if (!state) return false;

  const scopeStateKey = normalizeKey(agentScope.state);
  const callStateKey = normalizeKey(state);
  const stateOk =
    Boolean(scopeStateKey) &&
    Boolean(callStateKey) &&
    (scopeStateKey === callStateKey ||
      scopeStateKey.includes(callStateKey) ||
      callStateKey.includes(scopeStateKey) ||
      scopeStateKey === 'fct' ||
      callStateKey === 'fct');
  if (level === 'state') return stateOk;

  const callLgaKey = normalizeKey(lga);
  const scopeLgaKey = normalizeKey(agentScope.lga);
  return (
    stateOk &&
    Boolean(callLgaKey) &&
    Boolean(scopeLgaKey) &&
    (callLgaKey === scopeLgaKey ||
      callLgaKey.includes(scopeLgaKey) ||
      scopeLgaKey.includes(callLgaKey))
  );
};

// Parses a dialed queue line back into a tier scope. Accepts both the legacy
// single name (config.name, e.g. "support") and the geo forms:
//   queue:super, queue:state:<state>, queue:lga:<state>:<lga>
const parseQueueScope = (line) => {
  const value = String(line || '').trim();
  const lower = value.toLowerCase();
  if (lower === 'support' || lower === 'super' || lower === 'queue:super') {
    return { tier: TARGET.SUPER, state: null, lga: null };
  }
  if (!value.startsWith('queue:')) return null;
  const body = value.slice('queue:'.length);
  if (body.toLowerCase() === 'super') return { tier: TARGET.SUPER, state: null, lga: null };

  if (body.toLowerCase().startsWith('state:')) {
    const state = body.slice('state:'.length).trim();
    if (!state) return null;
    return { tier: TARGET.STATE, state, lga: null };
  }
  if (body.toLowerCase().startsWith('lga:')) {
    const rest = body.slice('lga:'.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return null;
    const state = rest.slice(0, sep).trim();
    const lga = rest.slice(sep + 1).trim();
    if (!state || !lga) return null;
    return { tier: TARGET.LGA, state, lga };
  }
  return null;
};

// Stable Twilio conference friendly-name for a tier scope's waiting room.
// super reuses the existing legacy room name for full backward compatibility.
const waitingRoomForScope = (scope, superRoom) => {
  if (!scope || scope.tier === TARGET.SUPER) return superRoom;
  if (scope.tier === TARGET.STATE) {
    return `${superRoom}_state_${normalizeKey(scope.state)}`;
  }
  return `${superRoom}_lga_${normalizeKey(scope.state)}_${normalizeKey(scope.lga)}`;
};

// Waiting rooms an agent should be pulled from for a caller, in ownership
// order (the caller's LGA tier first, then its state tier, then super).
// superRoom is always last so behaviour degrades exactly to today.
const waitingRoomsForCaller = (jurisdiction, superRoom) => {
  const state = String(jurisdiction?.state || '').trim();
  const lga = String(jurisdiction?.lga || '').trim();
  const rooms = [];
  if (state && lga) rooms.push(waitingRoomForScope({ tier: TARGET.LGA, state, lga }, superRoom));
  if (state) rooms.push(waitingRoomForScope({ tier: TARGET.STATE, state }, superRoom));
  rooms.push(superRoom);
  return rooms;
};

// Chooses which waiting caller an agent (who dialed `scope`) should answer.
// Ownership (Rule B): an LGA agent only takes callers whose jurisdiction is
// their LGA; a state agent takes callers from their state; super takes the
// newest (today's behaviour). Callers list should be newest-first.
const pickQueuedCallerForAgent = (callers, scope, geoOn) => {
  const rows = Array.isArray(callers) ? callers.filter((c) => c && c.call_sid) : [];
  if (!rows.length) return null;
  if (!geoOn) return rows[0];

  if (!scope || scope.tier === TARGET.SUPER) return rows[0];

  const norm = (value) => String(value || '').toLowerCase().trim();
  if (scope.tier === TARGET.STATE) {
    return rows.find((c) => norm(c.jurisdiction_state) === norm(scope.state)) || null;
  }
  return (
    rows.find(
      (c) =>
        norm(c.jurisdiction_state) === norm(scope.state) &&
        norm(c.jurisdiction_lga) === norm(scope.lga)
    ) || null
  );
};

module.exports = {
  TARGET,
  isGeoEnabled,
  rollUp,
  chooseRoutingTarget,
  queueLineFor,
  dispatchIdentityOrder,
  parseQueueScope,
  waitingRoomForScope,
  waitingRoomsForCaller,
  pickQueuedCallerForAgent,
  canAgentHandleJurisdiction,
};
