const test = require('node:test');
const assert = require('node:assert');
const {
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

test('voice routing: queue scope parsing', () => {
  assert.deepStrictEqual(parseQueueScope('support'), { tier: 'super', state: null, lga: null });
  assert.deepStrictEqual(parseQueueScope('queue:super'), { tier: 'super', state: null, lga: null });
  assert.deepStrictEqual(parseQueueScope('queue:state:Federal Capital Territory'), {
    tier: 'state',
    state: 'Federal Capital Territory',
    lga: null,
  });
  assert.deepStrictEqual(parseQueueScope('queue:lga:FCT:Gwagwalada'), {
    tier: 'lga',
    state: 'FCT',
    lga: 'Gwagwalada',
  });
  assert.deepStrictEqual(parseQueueScope('queue:lga:FCT:Obio/Akpor'), {
    tier: 'lga',
    state: 'FCT',
    lga: 'Obio/Akpor',
  });
  assert.strictEqual(parseQueueScope('queue:lga:FCT'), null);
  assert.strictEqual(parseQueueScope('+234123456'), null);
  assert.strictEqual(parseQueueScope(''), null);
  assert.strictEqual(parseQueueScope(null), null);
});

test('voice routing: waiting room naming + caller roll-up order', () => {
  const superRoom = 'rentalhub_agents_waiting';
  assert.strictEqual(waitingRoomForScope({ tier: 'super' }, superRoom), superRoom);
  assert.strictEqual(
    waitingRoomForScope({ tier: 'state', state: 'Federal Capital Territory' }, superRoom),
    'rentalhub_agents_waiting_state_federalcapitalterritory'
  );
  assert.strictEqual(
    waitingRoomForScope({ tier: 'lga', state: 'FCT', lga: 'Gwagwalada' }, superRoom),
    'rentalhub_agents_waiting_lga_fct_gwagwalada'
  );
  assert.deepStrictEqual(
    waitingRoomsForCaller({ state: 'FCT', lga: 'Gwagwalada' }, superRoom),
    ['rentalhub_agents_waiting_lga_fct_gwagwalada', 'rentalhub_agents_waiting_state_fct', superRoom]
  );
  assert.deepStrictEqual(waitingRoomsForCaller({ state: 'FCT', lga: '' }, superRoom), [
    'rentalhub_agents_waiting_state_fct',
    superRoom,
  ]);
  assert.deepStrictEqual(waitingRoomsForCaller(null, superRoom), [superRoom]);
});

test('voice routing: direct-join picks the owning caller', () => {
  const callers = [
    { call_sid: 'A', jurisdiction_state: 'FCT', jurisdiction_lga: 'Gwagwalada' },
    { call_sid: 'B', jurisdiction_state: 'FCT', jurisdiction_lga: 'Kuje' },
    { call_sid: 'C', jurisdiction_state: null, jurisdiction_lga: null },
  ];
  const lgaScope = parseQueueScope('queue:lga:FCT:Gwagwalada');
  const stateScope = parseQueueScope('queue:state:FCT');
  const superScope = parseQueueScope('queue:super');

  assert.strictEqual(pickQueuedCallerForAgent(callers, lgaScope, true).call_sid, 'A');
  assert.strictEqual(pickQueuedCallerForAgent(callers, stateScope, true).call_sid, 'A');
  assert.strictEqual(pickQueuedCallerForAgent(callers, superScope, true).call_sid, 'A');
  // Geo off -> newest regardless of scope.
  assert.strictEqual(pickQueuedCallerForAgent(callers, lgaScope, false).call_sid, 'A');
  // An LGA with no matching caller -> park (null).
  assert.strictEqual(pickQueuedCallerForAgent(callers, parseQueueScope('queue:lga:Lagos:Eti-Osa'), true), null);
  assert.strictEqual(pickQueuedCallerForAgent([], superScope, true), null);
});

test('voice routing: ownership (may agent act on this caller)', () => {
  const jurGwag = { state: 'FCT', lga: 'Gwagwalada' };
  const jurKuje = { state: 'FCT', lga: 'Kuje' };
  const jurOtherState = { state: 'Lagos', lga: 'Eti-Osa' };

  // super acts anywhere, including unknown jurisdiction.
  assert.strictEqual(canAgentHandleJurisdiction({ level: 'super' }, jurGwag), true);
  assert.strictEqual(canAgentHandleJurisdiction({ level: 'super' }, null), true);

  // state scoped to FCT.
  const stateScope = { level: 'state', state: 'Federal Capital Territory', lga: null };
  assert.strictEqual(canAgentHandleJurisdiction(stateScope, jurGwag), true);
  assert.strictEqual(canAgentHandleJurisdiction(stateScope, jurKuje), true);
  assert.strictEqual(canAgentHandleJurisdiction(stateScope, jurOtherState), false);
  assert.strictEqual(canAgentHandleJurisdiction(stateScope, null), false);

  // lga scoped to FCT/Gwagwalada.
  const lgaScope = { level: 'lga', state: 'FCT', lga: 'Gwagwalada' };
  assert.strictEqual(canAgentHandleJurisdiction(lgaScope, jurGwag), true);
  assert.strictEqual(canAgentHandleJurisdiction(lgaScope, jurKuje), false);
  assert.strictEqual(canAgentHandleJurisdiction(lgaScope, jurOtherState), false);
  assert.strictEqual(canAgentHandleJurisdiction(lgaScope, null), false);
  assert.strictEqual(canAgentHandleJurisdiction({ level: 'agent' }, jurGwag), false);
});
