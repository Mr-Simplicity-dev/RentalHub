const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

/**
 * The app must send the same live-capture proof the web sends, or the server
 * rejects every mobile listing. These are cheap guards against that contract
 * drifting on either side.
 */

const mobileRoot = path.join(__dirname, '..', 'RentalHubMobile');
const read = (...parts) => fs.readFileSync(path.join(mobileRoot, ...parts), 'utf8');

test('the mobile service can request a live capture session', () => {
  const source = read('src', 'services', 'propertyService.js');
  assert.ok(
    source.includes('/properties/image-capture-session'),
    'the app must call the live capture session endpoint'
  );
});

test('mobile property creation sends the live camera proof', () => {
  const source = read('src', 'screens', 'dashboard', 'AddPropertyScreen.js');
  assert.ok(
    source.includes("image_capture_source: 'live_camera'"),
    'listings must declare the live camera source'
  );
  assert.ok(
    source.includes('image_capture_tokens'),
    'the capture tickets must be submitted with the listing'
  );
  assert.ok(
    source.includes('images,'),
    'the captured photos must be attached to the payload'
  );
});

test('the app blocks a listing with no photos before uploading', () => {
  const source = read('src', 'screens', 'dashboard', 'AddPropertyScreen.js');
  assert.ok(
    source.includes('images.length === 0'),
    'an empty photo list must be rejected in the app'
  );
  assert.ok(
    source.includes('imageCaptureTokens.length !== images.length'),
    'a photo without its own ticket must be rejected in the app'
  );
});

test('photo capture uses the in-app camera, not the system gallery', () => {
  const source = read('src', 'components', 'properties', 'LivePropertyCapture.js');
  assert.ok(
    source.includes("from 'expo-camera'"),
    'expo-camera keeps the camera inside the app'
  );
  assert.ok(
    !source.includes('launchImageLibrary'),
    'the gallery picker would defeat the live-only rule'
  );
  assert.ok(
    source.includes('createLiveCaptureSession'),
    'each photo must obtain its own one-use ticket'
  );
});

test('the mobile photo limit matches the web limit of 8', () => {
  const source = read('src', 'components', 'properties', 'LivePropertyCapture.js');
  assert.match(source, /MAX_PROPERTY_PHOTOS\s*=\s*8/);
});

test('the app renders the property video the server already returns', () => {
  const detail = read('src', 'screens', 'home', 'PropertyDetailScreen.js');
  assert.ok(
    detail.includes('property.video_url'),
    'the detail screen must read the stored video url'
  );

  const player = read('src', 'components', 'properties', 'PropertyVideoPlayer.js');
  assert.ok(
    player.includes("from 'expo-video'"),
    'a video player must exist'
  );
});

test('the server still enforces the live capture rule the app obeys', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'propertyService.js'),
    'utf8'
  );
  assert.ok(
    source.includes("imageCaptureSource !== 'live_camera'"),
    'the server must keep rejecting non-live images'
  );
  assert.ok(
    source.includes('imageCaptureTokens.length !== images.length'),
    'the server must keep requiring one ticket per image'
  );
});
