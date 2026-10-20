const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { normalizeStateName, statesMatch } = require('../config/utils/stateName');

test('FCT and Federal Capital Territory are the same place', () => {
  assert.equal(
    normalizeStateName('FCT'),
    normalizeStateName('Federal Capital Territory')
  );
  assert.equal(statesMatch('FCT', 'Federal Capital Territory'), true);
  assert.equal(statesMatch('Federal Capital Territory', 'fct'), true);
});

test('Abuja is treated as the FCT', () => {
  assert.equal(statesMatch('Abuja', 'FCT'), true);
});

test('a trailing "State" suffix does not break a match', () => {
  assert.equal(statesMatch('Lagos State', 'Lagos'), true);
  assert.equal(statesMatch('Kano State', 'Kano'), true);
});

test('genuinely different states never match', () => {
  assert.equal(statesMatch('Lagos', 'Kano'), false);
  assert.equal(statesMatch('FCT', 'Nasarawa'), false);
});

test('empty values never match, even against each other', () => {
  assert.equal(statesMatch('', ''), false);
  assert.equal(statesMatch(null, undefined), false);
});
