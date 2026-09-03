const test = require('node:test');
const assert = require('node:assert');
const {
  VOICE_READ_ROLES,
  isVoiceReadRole,
  resolveVoiceReadScope,
  buildScopeClause,
} = require('../services/voiceJurisdiction');

test('voice jurisdiction: role allow-list', () => {
  assert.strictEqual(isVoiceReadRole('super_admin'), true);
  assert.strictEqual(isVoiceReadRole('super_support_admin'), true);
  assert.strictEqual(isVoiceReadRole('state_support_admin'), true);
  assert.strictEqual(isVoiceReadRole('lga_support_admin'), true);
  assert.strictEqual(isVoiceReadRole('state_admin'), true);
  assert.strictEqual(isVoiceReadRole('lga_admin'), true);
  assert.strictEqual(isVoiceReadRole('agent'), false);
  assert.strictEqual(VOICE_READ_ROLES.length, 6);
});

test('voice jurisdiction: scope resolution', () => {
  assert.deepStrictEqual(
    resolveVoiceReadScope({ user_type: 'super_support_admin' }),
    { level: 'super', state: null, lga: null }
  );
  assert.deepStrictEqual(
    resolveVoiceReadScope({ user_type: 'super_admin' }),
    { level: 'super', state: null, lga: null }
  );

  const stateScope = resolveVoiceReadScope({
    user_type: 'state_support_admin',
    assigned_state: ' FCT ',
  });
  assert.strictEqual(stateScope.level, 'state');
  assert.strictEqual(stateScope.state, 'FCT');

  const lgaScope = resolveVoiceReadScope({
    user_type: 'lga_support_admin',
    assigned_state: 'FCT',
    assigned_lga: 'Gwagwalada',
  });
  assert.strictEqual(lgaScope.level, 'lga');
  assert.strictEqual(lgaScope.lga, 'Gwagwalada');

  // assigned_city is the fallback LGA column (support-ticket convention).
  const lgaFallback = resolveVoiceReadScope({
    user_type: 'lga_support_admin',
    assigned_state: 'FCT',
    assigned_city: 'Kuje',
  });
  assert.strictEqual(lgaFallback.lga, 'Kuje');

  assert.throws(() => resolveVoiceReadScope({ user_type: 'agent' }), /cannot view/);
  assert.throws(() => resolveVoiceReadScope({ user_type: 'state_support_admin' }), /state/);
  assert.throws(() => resolveVoiceReadScope({ user_type: 'lga_admin', assigned_state: 'FCT' }), /LGA/);
});

test('voice jurisdiction: SQL scope clause', () => {
  const superClause = buildScopeClause({ level: 'super', state: null, lga: null }, 'latest');
  assert.strictEqual(superClause.clause, '');
  assert.deepStrictEqual(superClause.params, []);

  const stateClause = buildScopeClause({ level: 'state', state: 'FCT', lga: null }, 'latest');
  assert.match(stateClause.clause, /latest\.jurisdiction_state/);
  assert.deepStrictEqual(stateClause.params, ['FCT']);

  const lgaClause = buildScopeClause({ level: 'lga', state: 'FCT', lga: 'Gwagwalada' }, '');
  assert.match(lgaClause.clause, /jurisdiction_lga/);
  assert.deepStrictEqual(lgaClause.params, ['FCT', 'Gwagwalada']);
});
