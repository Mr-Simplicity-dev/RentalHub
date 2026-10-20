const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * Calls only struggle on mobile data, and that is almost always a missing TURN
 * relay rather than a code bug. These guards keep the relay wired on both
 * surfaces, and keep video at a quality worth watching.
 */

const mobileRoot = path.join(__dirname, '..', 'RentalHubMobile');
const readMobile = (...parts) => fs.readFileSync(path.join(mobileRoot, ...parts), 'utf8');
const readWeb = (...parts) =>
  fs.readFileSync(path.join(__dirname, '..', 'client', 'src', ...parts), 'utf8');

test('the app adds a TURN relay when one is configured', () => {
  const source = readMobile('src', 'config', 'webrtcConfig.js');
  assert.ok(source.includes('TURN_URL'), 'a TURN url must be read from the environment');
  assert.ok(source.includes('credential: turnPassword'), 'TURN credentials must be passed');
});

test('TURN credentials are never hard-coded', () => {
  const source = readMobile('src', 'config', 'webrtcConfig.js');
  // Any literal credential assignment (not reading from process.env) is a leak.
  assert.ok(
    !/credential:\s*['"][^'"]+['"]/.test(source),
    'a literal TURN credential in the source would leak the relay'
  );
  assert.ok(
    !/turn:.*@/.test(source),
    'credentials must not be embedded in a turn: url'
  );
});

test('the web adds a TURN relay too, matching the app', () => {
  const source = readWeb('config', 'webrtcConfig.js');
  assert.ok(source.includes('TURN_URL'), 'the web must read the TURN url');
  assert.ok(source.includes('turns:'), 'the web should offer a TLS fallback');
});

test('calls request 720p video', () => {
  const source = readMobile('src', 'components', 'calls', 'NativeCallOverlay.js');
  assert.ok(source.includes('ideal: 1280'), '720p width must be requested');
  assert.ok(source.includes('ideal: 720'), '720p height must be requested');
});

test('a phone that refuses 720p still gets a call, not an error', () => {
  const source = readMobile('src', 'components', 'calls', 'NativeCallOverlay.js');
  assert.ok(
    source.includes('highQualityError'),
    'there must be an explicit fallback for lower-quality cameras'
  );
  assert.ok(source.includes('ideal: 640'), 'the fallback should drop to 480p');
});

test('the web call also requests 720p video', () => {
  const source = readWeb('context', 'SocketContext.jsx');
  assert.ok(source.includes('ideal: 1280'), 'web calls should request 720p');
});

test('a missing TURN server can be detected rather than guessed', () => {
  const source = readMobile('src', 'config', 'webrtcConfig.js');
  assert.ok(source.includes('isTurnConfigured'), 'a helper must report TURN availability');
});
