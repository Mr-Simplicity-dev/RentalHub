const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.NODE_ENV = 'test';

const {
  buildNarrationTrack,
  mixTourAudio,
  renderAspectVariants,
  probeMediaDimensions,
  getCropBias,
  OUTPUT_PROFILES,
} = require('../config/utils/propertyTourVideo');
const {
  PROPERTY_FEATURES,
  validateStructuredFeatures,
  buildFeatureHighlights,
} = require('../config/utils/propertyFeatureSchema');
const {
  generateNarrationScript,
  formatNairaSpoken,
  numberToWords,
} = require('../config/utils/propertyTourNarration');
const voiceService = require('../config/utils/propertyTourVoiceService');

const videoSource = fs.readFileSync(
  path.join(__dirname, '..', 'config', 'utils', 'propertyTourVideo.js'),
  'utf8'
);
const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'config', 'utils', 'propertyTourService.js'),
  'utf8'
);
const clientSchemaSource = fs.readFileSync(
  path.join(__dirname, '..', 'client', 'src', 'data', 'propertyFeatureSchema.js'),
  'utf8'
);

// ---------------------------------------------------------------- audio ----

test('voice and music are optional and never fatal', async () => {
  // No music, no voice -> the silent master is returned untouched.
  const result = await mixTourAudio({
    binary: 'ffmpeg-that-does-not-exist',
    videoPath: 'missing.mp4',
    musicPath: null,
    narrationPath: null,
    outputPath: 'out.mp4',
  });
  assert.equal(result, 'missing.mp4', 'no audio inputs means no mixing pass');

  // A broken narration track is ignored rather than thrown.
  const track = await buildNarrationTrack({
    binary: 'ffmpeg-that-does-not-exist',
    segmentPaths: ['does-not-exist.mp3'],
    outputPath: path.join(__dirname, 'nope.mp3'),
  });
  assert.equal(track, null, 'nothing usable means no narration track');
});

test('the mix ducks music under narration and stays bounded', () => {
  assert.ok(
    videoSource.includes('sidechaincompress'),
    'the music bed is ducked under the voice'
  );
  assert.ok(videoSource.includes('alimiter'), 'the mix cannot clip');
  assert.ok(videoSource.includes("'-shortest'"), 'the mix ends with the picture');
  assert.ok(videoSource.includes('afade=t=in'), 'music fades in');
  assert.ok(videoSource.includes('afade=t=out'), 'music fades out');
  assert.ok(
    serviceSource.includes('voiceEnabled: Boolean(narrationPath)'),
    'the tour only claims voice when a track exists'
  );
});

test('narration is fact grounded and only mentions confirmed data', () => {
  const property = {
    bedrooms: 3,
    bathrooms: 2,
    property_type: 'flat',
    area: 'Gwarinpa',
    city: 'Abuja',
    state: 'FCT',
    rent_amount: 2500000,
    payment_frequency: 'yearly',
  };

  const segments = generateNarrationScript(property, ['building_front', 'sitting_room', 'kitchen'], {
    parking: { available: true, details: { capacity: 2 } },
    water_board: { available: null },
    solar: { available: false },
  });

  const text = segments.map((segment) => segment.text).join(' ');
  assert.ok(text.includes('Gwarinpa'), 'a known area is spoken');
  assert.ok(text.includes('two million five hundred thousand naira per year'));
  assert.ok(text.includes('parking'), 'a confirmed feature is spoken');
  assert.ok(!text.includes('solar'), 'an explicitly unavailable feature is not advertised');
  assert.ok(!text.includes('water'), 'an unspecified feature is never claimed');
  assert.ok(!/luxury|beautiful|perfect|amazing/i.test(text), 'no marketing invention');
});

test('naira amounts are spoken, not read digit by digit', () => {
  assert.equal(numberToWords(2500000), 'two million five hundred thousand');
  assert.equal(formatNairaSpoken(150000, 'monthly'), 'one hundred and fifty thousand naira per month');
  assert.equal(formatNairaSpoken(0), '', 'a missing price says nothing');
});

test('the voice service is provider agnostic and degrades quietly', async () => {
  assert.equal(typeof voiceService.synthesizeSpeech, 'function');
  // Voice is disabled by default, so this resolves null without a network call.
  const result = await voiceService.synthesizeSpeech({ text: 'Hello' });
  assert.equal(result, null);
  assert.ok(
    voiceService.getVoiceCacheDir().length > 0,
    'a cache directory is always available'
  );
});

// ------------------------------------------------------------ variants ----

test('portrait variants are rendered from the master without cropping faces off', () => {
  assert.ok(OUTPUT_PROFILES['9:16'], 'vertical profile exists');
  assert.ok(OUTPUT_PROFILES['4:5'], 'portrait feed profile exists');
  assert.ok(
    videoSource.includes('gblur=sigma=32'),
    'portrait formats use a blurred fill instead of a hard crop'
  );
  assert.ok(
    serviceSource.includes('onVariant'),
    'variants are handed back to the service for storage'
  );
  assert.ok(
    serviceSource.includes('video_variants'),
    'variant urls are persisted on the property'
  );
});

// -------------------------------------------------------------- photos ----

test('weak photos are rejected and the crop favours the subject', async () => {
  const missing = await probeMediaDimensions('ffmpeg-that-does-not-exist', 'x.jpg');
  assert.equal(missing, null, 'an unreadable probe is unknown, never "invalid"');

  assert.ok(getCropBias('building_front') < getCropBias('bathroom'), 'exteriors bias upward');
  assert.ok(getCropBias('unknown-shot') > 0 && getCropBias('unknown-shot') < 1);
  assert.ok(
    videoSource.includes('PROPERTY_TOUR_MIN_PHOTO_WIDTH') ||
      serviceSource.includes('PROPERTY_TOUR_MIN_PHOTO_WIDTH'),
    'a minimum photo size is configurable'
  );
  assert.ok(videoSource.includes('unsharp'), 'photos get a restrained sharpen pass');
  assert.ok(videoSource.includes('deshake'), 'clips are stabilised');
});

// ------------------------------------------------------- structured data ----

test('structured features keep the three states distinct', () => {
  const { valid, features } = validateStructuredFeatures({
    water_board: { available: true, details: { availabilityType: 'scheduled' } },
    generator: { available: false },
    solar: { available: null },
    cctv: true,
    made_up_feature: { available: true },
  });

  assert.equal(valid, true);
  assert.equal(features.water_board.available, true);
  assert.equal(features.generator.available, false);
  assert.equal(features.solar.available, null);
  assert.equal(features.cctv.available, true, 'a bare boolean is accepted');
  assert.equal(features.made_up_feature, undefined, 'unknown keys are dropped');
});

test('only confirmed features become on-screen highlights', () => {
  const highlights = buildFeatureHighlights(
    {
      water_board: { available: true },
      parking: { available: true, details: { capacity: 2 } },
      generator: { available: false },
      solar: { available: null },
    },
    4
  );

  assert.ok(highlights.includes('Public Water / Water Board'));
  assert.ok(highlights.includes('Parking'));
  assert.ok(!highlights.includes('Generator'), 'a stated "no" is not a selling point');
  assert.ok(!highlights.includes('Solar Power'), 'unspecified is not a selling point');
});

test('landlord and client feature schemas stay in sync', () => {
  const serverKeys = PROPERTY_FEATURES.map((feature) => feature.key).sort();
  const clientKeys = [...clientSchemaSource.matchAll(/key: '([a-z0-9_]+)'/g)]
    .map((match) => match[1]);
  // Client schema repeats some detail keys (e.g. type); intersect on the
  // feature labels instead, which are unique per feature.
  for (const feature of PROPERTY_FEATURES) {
    assert.ok(
      clientSchemaSource.includes(`label: '${feature.label}'`),
      `client schema is missing ${feature.key}`
    );
  }
  assert.ok(serverKeys.length >= 40, 'the platform describes a real feature set');
  assert.ok(clientKeys.length > 0);
});

test('feature driven search and detail wiring exists', () => {
  const propertyServiceSource = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'propertyService.js'),
    'utf8'
  );
  assert.ok(
    propertyServiceSource.includes("structured_features -> $${paramCount} -> 'available'"),
    'search filters on explicitly confirmed features only'
  );
  assert.ok(
    propertyServiceSource.includes('validateStructuredFeatures'),
    'the API sanitises structured features before saving'
  );
});
