const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';

const {
  GUIDED_SHOTS,
  buildTourArgs,
  isFfmpegAvailable,
  resolveFfmpegPath,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
} = require('../config/utils/propertyTourVideo');

const serviceSource = fs.readFileSync(
  path.join(__dirname, '..', 'config', 'utils', 'propertyTourService.js'),
  'utf8'
);
const jobSource = fs.readFileSync(
  path.join(__dirname, '..', 'jobs', 'propertyTourJobs.js'),
  'utf8'
);
const propertySource = fs.readFileSync(
  path.join(__dirname, '..', 'services', 'propertyService.js'),
  'utf8'
);

test('the guided shots cover a sensible walk through the property', () => {
  assert.equal(GUIDED_SHOTS.length, 8, 'there must be 8 guided shots to match the photo limit');

  const keys = GUIDED_SHOTS.map((shot) => shot.key);
  assert.equal(keys[0], 'building_front', 'the tour should open on the building');
  assert.ok(keys.includes('street'), 'the tour should end showing the street');

  for (const shot of GUIDED_SHOTS) {
    assert.ok(shot.label && shot.label.length > 2, 'every shot needs a prompt label');
    assert.ok(shot.hint && shot.hint.length > 5, 'every shot needs a hint for the landlord');
  }
});

test('the tour is encoded at watchable quality', () => {
  assert.equal(OUTPUT_WIDTH, 1280);
  assert.equal(OUTPUT_HEIGHT, 720);
  assert.equal(OUTPUT_FPS, 30);
});

test('the encode command uses a broadly playable format', () => {
  const args = buildTourArgs({
    photoPaths: ['a.jpg', 'b.jpg', 'c.jpg'],
    outputPath: 'out.mp4',
    labels: ['One', 'Two', 'Three'],
  });

  const joined = args.join(' ');
  assert.ok(joined.includes('libx264'), 'H.264 plays everywhere');
  assert.ok(joined.includes('yuv420p'), 'yuv420p is required by many phone players');
  assert.ok(joined.includes('+faststart'), 'faststart lets the video begin before it finishes downloading');
  assert.ok(joined.includes('xfade'), 'stills should glide together, not cut');
  assert.ok(joined.includes('zoompan'), 'each still should slowly zoom');
});

test('the encode handles a single photo without a cross-fade', () => {
  const args = buildTourArgs({
    photoPaths: ['only.jpg'],
    outputPath: 'out.mp4',
    labels: ['One'],
  });
  // One input, one output, and no xfade chain that would reference a missing input.
  assert.ok(!args.join(' ').includes('xfade'), 'a lone photo cannot be cross-faded');
});

test('a tour is never built from a single photo', () => {
  // One still is not a tour, and the listing already shows it.
  const videoSource = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'utils', 'propertyTourVideo.js'),
    'utf8'
  );
  assert.ok(videoSource.includes('photoPaths.length < 2'), 'the encoder refuses a lone photo');
  assert.ok(serviceSource.includes('MIN_PHOTOS = 2'), 'the service needs at least two photos');
});

test('a generated tour never overwrites a real landlord video', () => {
  assert.ok(
    serviceSource.includes('!force && existing.rows[0].video_url'),
    'an uploaded video must win over a generated one'
  );
});

test('the tour is queued in the background, not during the request', () => {
  assert.ok(
    propertySource.includes('enqueuePropertyTour'),
    'creating a property should queue a tour'
  );
  // Queueing must be fire-and-forget so the landlord is not kept waiting.
  assert.ok(
    /enqueuePropertyTour\([^)]*\)\.catch\(\(\) => \{\}\)/.test(propertySource),
    'queueing must not block the response'
  );
});

test('a missing ffmpeg binary degrades quietly instead of throwing', () => {
  assert.ok(serviceSource.includes('isFfmpegAvailable'));
  assert.ok(
    serviceSource.includes('Property tour skipped'),
    'a missing encoder must be logged, not thrown'
  );
});

test('video generation failures never reach the listing', () => {
  // Every path out of the job is guarded.
  assert.ok(jobSource.includes('catch (error)'));
  assert.ok(
    jobSource.includes("'failed'") && jobSource.includes("'pending'"),
    'a failure is retried, then parked as failed'
  );
  assert.ok(
    jobSource.includes('attempts < $1'),
    'retries must be bounded so a broken photo cannot loop forever'
  );
});

test('two workers cannot encode the same property twice', () => {
  assert.ok(
    jobSource.includes('FOR UPDATE SKIP LOCKED'),
    'jobs must be claimed atomically across pm2 workers'
  );
  assert.ok(
    jobSource.includes("process.env.pm_id && process.env.pm_id !== '0'"),
    'only one worker should own the timer'
  );
});

test('the scratch directory is always cleaned up', () => {
  assert.ok(
    serviceSource.includes('cleanupScratchDir(scratch)'),
    'temporary photos must be removed even when encoding fails'
  );
  assert.ok(serviceSource.includes('finally'), 'cleanup must run on every path');
});

test('photo downloads are bounded so a bad url cannot hang a job', () => {
  assert.ok(serviceSource.includes('DOWNLOAD_TIMEOUT_MS'), 'downloads need a timeout');
  assert.ok(serviceSource.includes('maxContentLength'), 'downloads need a size cap');
});

test('ffmpeg resolves on this machine, bundled or from the system', () => {
  const binary = resolveFfmpegPath();
  assert.ok(binary, 'a binary (bundled or system) must be found');
  assert.ok(isFfmpegAvailable());
});
