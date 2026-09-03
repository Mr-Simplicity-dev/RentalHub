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

module.exports = { TARGET, isGeoEnabled, rollUp, chooseRoutingTarget, queueLineFor };
