const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

// Prembly's Nigerian NIN lookup and international passport lookup live at
// /verification/vnin and /verification/national_passport. The app used to call
// /identityverification/verify/*, which does not exist and returned 404 for
// every NIN attempt, so verification could never succeed.
const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'config', 'utils', 'premblyValidator.js'),
  'utf8'
);

// Strip comments so assertions target real code, not explanatory notes.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ninBlock = code.slice(
  code.indexOf('exports.verifyNINWithPrembly'),
  code.indexOf('exports.verifyInternationalPassportWithPrembly')
);
const passportBlock = code.slice(
  code.indexOf('exports.verifyInternationalPassportWithPrembly'),
  code.indexOf('exports.performKYCCheckWithPrembly')
);

test('NIN verification calls Prembly\'s real /verification/vnin endpoint', () => {
  assert.match(ninBlock, /verification\/vnin/);
  assert.doesNotMatch(ninBlock, /identityverification/);
});

test('NIN verification sends the field Prembly expects (number_nin)', () => {
  assert.match(ninBlock, /number_nin/);
});

test('passport verification calls Prembly\'s real /verification/national_passport endpoint', () => {
  assert.match(passportBlock, /verification\/national_passport/);
  assert.doesNotMatch(passportBlock, /identityverification/);
});

test('Prembly calls authenticate with the x-api-key header, not a bearer token', () => {
  assert.match(ninBlock, /'x-api-key': PREMBLY_SECRET_KEY/);
  assert.doesNotMatch(ninBlock, /Authorization.*Bearer/);
  assert.match(passportBlock, /'x-api-key': PREMBLY_SECRET_KEY/);
});
