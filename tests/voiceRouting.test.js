const test = require('node:test');
const assert = require('node:assert');
const {
  TARGET,
  isGeoEnabled,
  rollUp,
  chooseRoutingTarget,
  queueLineFor,
  dispatchIdentityOrder,
} = require('../services/voiceRouting');

test('voice routing: geo flag gate', () => {
  assert.strictEqual(isGeoEnabled({ voice_geo_routing: true }), true);
  assert.strictEqual(isGeoEnabled({ voice_geo_routing: false }), false);
  assert.strictEqual(isGeoEnabled({}), false);
  assert.strictEqual(isGeoEnabled(null), false);
});

test('voice routing: roll-up ladder', () => {
  assert.strictEqual(rollUp(TARGET.LGA), TARGET.STATE);
  assert.strictEqual(rollUp(TARGET.STATE), TARGET.SUPER);
  assert.strictEqual(rollUp(TARGET.SUPER), null);
  assert.strictEqual(rollUp(null), null);
});

test('voice routing: choose target with full duty roster', () => {
  const jur = { state: 'Federal Capital Territory', lga: 'Gwagwalada' };

  let r = chooseRoutingTarget(jur, { lga: true, state: true, super: true });
  assert.strictEqual(r.tier, TARGET.LGA);
  assert.strictEqual(r.lga, 'Gwagwalada');
  assert.strictEqual(r.reason, null);

  // LGA unstaffed -> state (zonal) manages all LGAs under it.
  r = chooseRoutingTarget(jur, { lga: false, state: true, super: true });
  assert.strictEqual(r.tier, TARGET.STATE);
  assert.strictEqual(r.reason, 'lga_unstaffed');

  // LGA + state unstaffed -> super support.
  r = chooseRoutingTarget(jur, { lga: false, state: false, super: true });
  assert.strictEqual(r.tier, TARGET.SUPER);

  // Nobody staffed.
  r = chooseRoutingTarget(jur, { lga: false, state: false, super: false });
  assert.strictEqual(r.tier, null);
  assert.strictEqual(r.reason, 'unstaffed');

  // Missing jurisdiction parts degrade safely.
  assert.strictEqual(chooseRoutingTarget({ state: 'FCT', lga: '' }, { lga: true, state: true, super: true }).tier, TARGET.STATE);
  assert.strictEqual(chooseRoutingTarget({ state: '', lga: '' }, { lga: true, state: true, super: true }).tier, TARGET.SUPER);
  assert.strictEqual(chooseRoutingTarget({}, { lga: true, state: false, super: false }).tier, null);
});

test('voice routing: queue line naming', () => {
  assert.strictEqual(
    queueLineFor({ tier: TARGET.LGA, state: 'FCT', lga: 'Gwagwalada' }),
    'queue:lga:FCT:Gwagwalada'
  );
  assert.strictEqual(queueLineFor({ tier: TARGET.STATE, state: 'FCT' }), 'queue:state:FCT');
  assert.strictEqual(queueLineFor({ tier: TARGET.SUPER }), 'queue:super');
  assert.strictEqual(queueLineFor(null), null);
});

test('voice routing: dispatch identity order rolls up the geo ladder', () => {
  const jur = { state: 'FCT', lga: 'Gwagwalada' };
  const superOnly = { lga: [], state: [], super: ['support_agent_1'] };
  const all = { lga: ['lga_fct_gwagwalada'], state: ['state_fct'], super: ['support_agent_1'] };
  const lgaState = { lga: ['lga_fct_gwagwalada'], state: ['state_fct'], super: [] };

  assert.deepStrictEqual(dispatchIdentityOrder(jur, all), ['lga_fct_gwagwalada']);
  // LGA empty -> rolls to state.
  assert.deepStrictEqual(
    dispatchIdentityOrder(jur, { lga: [], state: ['state_fct'], super: ['support_agent_1'] }),
    ['state_fct']
  );
  // Only super staffed -> everything rolls to super (today's behaviour).
  assert.deepStrictEqual(dispatchIdentityOrder(jur, superOnly), ['support_agent_1']);
  // Nobody staffed anywhere.
  assert.deepStrictEqual(dispatchIdentityOrder(jur, { lga: [], state: [], super: [] }), []);
  // Unknown jurisdiction -> super (never geo-locks an unidentified caller).
  assert.deepStrictEqual(dispatchIdentityOrder(null, all), ['support_agent_1']);
  assert.deepStrictEqual(dispatchIdentityOrder({ state: '', lga: '' }, all), ['support_agent_1']);
  // LGA + state staffed but no super: LGA first, rolls to state.
  assert.deepStrictEqual(dispatchIdentityOrder(jur, lgaState), ['lga_fct_gwagwalada']);
});
