const test = require('node:test');
const assert = require('node:assert/strict');
const roles = require('../config/utils/roleHierarchy');
const zones = require('../config/utils/territorialZones');
const { canAccessTerritory } = require('../config/utils/territorialAccess');

test('legacy admin normalizes to canonical LGA Admin', () => {
  assert.equal(roles.normalizeRole('admin'), 'lga_admin');
  assert.equal(roles.roleIn('admin', roles.LGA_SCOPED_ROLES), true);
  assert.equal(roles.CREATABLE_ADMIN_ROLES.includes('admin'), false);
});

test('general territorial hierarchy has exactly four canonical roles', () => {
  assert.deepEqual(roles.GENERAL_ADMIN_ROLES, ['lga_admin', 'state_admin', 'zonal_admin', 'super_admin']);
  assert.equal(roles.CREATABLE_ADMIN_ROLES.includes('super_admin'), false);
});

test('all Nigerian states and FCT map to one of six zones', () => {
  const mapped = Object.values(zones.ZONE_STATES).flat();
  assert.equal(zones.ZONES.length, 6);
  assert.equal(mapped.length, 37);
  assert.equal(new Set(mapped).size, 37);
  assert.equal(zones.zoneForState('FCT'), 'North Central');
});

test('zonal scope includes assigned-zone states and rejects outside states', () => {
  assert.equal(zones.zoneContainsState('South West', 'Lagos'), true);
  assert.equal(zones.zoneContainsState('South West', 'Kano'), false);
});

test('territorial scope collections remain separated', () => {
  assert.equal(roles.LGA_SCOPED_ROLES.includes('state_admin'), false);
  assert.equal(roles.STATE_SCOPED_ROLES.includes('lga_admin'), false);
  assert.deepEqual(roles.ZONAL_SCOPED_ROLES, ['zonal_admin']);
  assert.equal(roles.SUPER_SCOPED_ROLES.includes('super_admin'), true);
});

test('complete territorial authorization matrix denies lateral and upward leakage', () => {
  const lagosIkeja = { state: 'Lagos', lga: 'Ikeja' };
  const lagosEpe = { state: 'Lagos', lga: 'Epe' };
  const fctAmac = { state: 'FCT', lga: 'AMAC' };
  assert.equal(canAccessTerritory({ user_type: 'admin', assigned_state: 'Lagos', assigned_city: 'Ikeja' }, lagosIkeja), true);
  assert.equal(canAccessTerritory({ user_type: 'lga_admin', assigned_state: 'Lagos', assigned_city: 'Ikeja' }, lagosEpe), false);
  assert.equal(canAccessTerritory({ user_type: 'lga_admin', assigned_state: 'Lagos', assigned_city: 'Ikeja' }, fctAmac), false);
  assert.equal(canAccessTerritory({ user_type: 'state_admin', assigned_state: 'Lagos' }, lagosEpe), true);
  assert.equal(canAccessTerritory({ user_type: 'state_admin', assigned_state: 'Lagos' }, fctAmac), false);
  assert.equal(canAccessTerritory({ user_type: 'zonal_admin', assigned_zone: 'South West' }, lagosIkeja), true);
  assert.equal(canAccessTerritory({ user_type: 'zonal_admin', assigned_zone: 'South West' }, fctAmac), false);
  assert.equal(canAccessTerritory({ user_type: 'super_admin' }, fctAmac), true);
});

test('specialist and marketplace roles are not promoted into general territorial authority', () => {
  const target = { state: 'Lagos', lga: 'Ikeja' };
  ['state_financial_admin', 'recruitment_admin', 'lawyer', 'landlord', 'agent'].forEach((user_type) => {
    assert.equal(canAccessTerritory({ user_type, assigned_state: 'Lagos', assigned_city: 'Ikeja' }, target), false);
  });
});
