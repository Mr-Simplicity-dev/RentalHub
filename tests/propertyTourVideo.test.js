const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsPromises = require('fs/promises');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';

const {
  GUIDED_SHOTS,
  isFfmpegAvailable,
  resolveFfmpegPath,
  findMarkPath,
  findFontPath,
  buildIntroArgs,
  buildOutroArgs,
  shotPlan,
  labelWindows,
  totalTourSeconds,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
  PREMIUM_HOLD,
  SNAPPY_HOLD,
  BRAND_NAME,
  BRAND_DOMAIN,
  BRAND_EMAIL,
  BRAND_PHONE,
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

test('the tour is encoded at 4K for a sharp master', () => {
  assert.equal(OUTPUT_WIDTH, 3840);
  assert.equal(OUTPUT_HEIGHT, 2160);
  assert.equal(OUTPUT_FPS, 30);
});

test('the brand identity is baked in and configurable', () => {
  assert.equal(BRAND_NAME, 'Amana RentalHub NG');
  assert.equal(BRAND_DOMAIN, 'rentalhub.com.ng');
  assert.equal(BRAND_EMAIL, 'support@rentalhub.com.ng');
  assert.ok(BRAND_PHONE, 'a phone number must be available for the advert');
});

test('the real logo mark and font are found for the watermark', () => {
  assert.ok(findMarkPath(), 'the brand mark PNG must resolve');
  assert.ok(findMarkPath().endsWith('rentalhub-mark.png'));
  assert.ok(findFontPath(), 'a font must resolve');
});

test('the intro drops the mark in and spins it a full circle', () => {
  const args = buildIntroArgs({
    outputPath: 'intro.mp4',
    markPath: findMarkPath(),
    title: '4 Bedroom Duplex',
    location: 'Gwarinpa, Abuja',
    fontPath: findFontPath(),
  });

  const joined = args.join(' ');
  assert.ok(joined.includes('rotate=2*PI*t'), 'the mark must turn a full 360 degrees');
  assert.ok(joined.includes('overlay'), 'the mark must be composited over the card');
  assert.ok(joined.includes('4 Bedroom Duplex'), 'the property title belongs on the card');
  assert.ok(joined.includes('Gwarinpa, Abuja'), 'the location belongs on the card');
  assert.ok(joined.includes('libx264') && joined.includes('yuv420p'), 'intro must be broadly playable');
});

test('the intro pads the mark so a spinning image never clips', () => {
  // ffmpeg sizes the rotate output once, at setup, so a time-based out size
  // fails. Padding to a fixed square is what makes the spin possible.
  const args = buildIntroArgs({ outputPath: 'i.mp4', markPath: findMarkPath(), fontPath: findFontPath() });
  assert.ok(args.join(' ').includes('pad='), 'the mark must be padded before rotating');
});

test('the end card shows every way to reach us', () => {
  const args = buildOutroArgs({
    outputPath: 'outro.mp4',
    markPath: findMarkPath(),
    fontPath: findFontPath(),
    phone: '08030601238',
  });

  const joined = args.join(' ');
  assert.ok(joined.includes(BRAND_NAME), 'the brand name must close the video');
  assert.ok(joined.includes('rentalhub.com.ng'), 'the website must be on the card');
  assert.ok(joined.includes('support@rentalhub.com.ng'), 'the support email must be on the card');
  assert.ok(joined.includes('08030601238'), 'the phone number must be on the card');
});

test('the contact crawl advertises while the tour plays', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'utils', 'propertyTourVideo.js'),
    'utf8'
  );
  assert.ok(source.includes('drawtext'), 'the crawl is drawn with drawtext');
  assert.ok(source.includes('W-mod(t*'), 'the crawl must scroll like a news ticker');
  assert.ok(source.includes('crawl'), 'the crawl must be assembled');
});

test('the premium and snappy feels alternate shot to shot', () => {
  assert.ok(PREMIUM_HOLD > SNAPPY_HOLD, 'the premium feel holds longer');
  assert.ok(shotPlan(0).premium, 'the tour opens on the premium feel');
  assert.ok(!shotPlan(1).premium, 'the next shot uses the snappy feel');
  assert.ok(shotPlan(2).premium, 'the feels keep alternating');
});

test('the tour body uses a broadly playable format', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'config', 'utils', 'propertyTourVideo.js'),
    'utf8'
  );
  assert.ok(source.includes('libx264'), 'H.264 plays everywhere');
  assert.ok(source.includes('yuv420p'), 'yuv420p is required by many phone players');
  assert.ok(source.includes('+faststart'), 'faststart lets the video begin before it downloads');
  assert.ok(source.includes('xfade'), 'stills should glide together, not cut');
  assert.ok(source.includes('zoompan'), 'each still should slowly zoom');
});

test('the caption windows line up with the shots', () => {
  const labels = GUIDED_SHOTS.slice(0, 4).map((shot) => shot.label);
  const windows = labelWindows(labels);

  assert.equal(windows.length, 4, 'one window per shot');
  assert.equal(windows[0].from, 0, 'the first caption is on screen immediately');

  for (let index = 1; index < windows.length; index += 1) {
    assert.ok(
      windows[index].from > windows[index - 1].from,
      'captions must appear in order'
    );
    assert.ok(
      windows[index].to > windows[index].from,
      'every caption needs time on screen'
    );
  }

  assert.ok(
    windows[windows.length - 1].to <= totalTourSeconds(labels.length) + 0.01,
    'the last caption cannot outlive the tour'
  );
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

test('a single photo would have no cross-fade to build', () => {
  // The cross-fade chain only starts from the second shot, so one still simply
  // has no transition; the guard above stops it ever reaching the encoder.
  const labels = GUIDED_SHOTS.slice(0, 2).map((shot) => shot.label);
  const windows = labelWindows(labels);
  assert.equal(windows.length, 2);
  assert.ok(windows[1].from > 0, 'the second caption only appears after a transition');
});

test('the phone number can differ per state', () => {
  assert.ok(
    serviceSource.includes('PROPERTY_TOUR_PHONE_STATES'),
    'per-state numbers must be configurable'
  );
  assert.ok(
    serviceSource.includes('resolvePhoneForState'),
    'the state must be resolved to a number'
  );
});

test('the intro card is given the property title and location', () => {
  assert.ok(serviceSource.includes('title: property.title'), 'the intro needs the title');
  assert.ok(serviceSource.includes('location,'), 'the intro needs the location');
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
