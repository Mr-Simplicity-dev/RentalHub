/**
 * Preview / proof script for the automatic property tour video.
 *
 * Run it to render a real sample video without needing a live property:
 *
 *   node scripts/render-tour-preview.js
 *
 * It builds stand-in "property photos", runs the exact production encoder from
 * config/utils/propertyTourVideo.js, and writes the finished mp4 to
 * scripts/tour-preview/preview.mp4 so it can be opened and reviewed.
 *
 * This is a development tool. It is never called by the running server.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  createTourVideo,
  resolveFfmpegPath,
  GUIDED_SHOTS,
  totalTourSeconds,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
  BRAND_NAME,
  BRAND_DOMAIN,
  BRAND_EMAIL,
  BRAND_PHONE,
} = require('../config/utils/propertyTourVideo');

const ffmpeg = resolveFfmpegPath();
if (!ffmpeg) {
  console.error('No ffmpeg binary found. Run `npm install` so ffmpeg-static installs.');
  process.exit(1);
}

const outDir = path.join(__dirname, 'tour-preview');
fs.mkdirSync(outDir, { recursive: true });

const PHOTO_COUNT = Number(process.env.PREVIEW_PHOTOS) || 8;

// Stand-in photos. Each one is a distinct colour with its shot number burned in,
// so the cut order and the captions can be checked at a glance.
const COLOURS = [
  '0x1d4ed8', '0x0f766e', '0x7c2d12', '0x6d28d9',
  '0x0369a1', '0x15803d', '0xb45309', '0x334155',
];

const scratch = path.join(outDir, 'source');
fs.rmSync(scratch, { recursive: true, force: true });
fs.mkdirSync(scratch, { recursive: true });

console.log(`Rendering a ${PHOTO_COUNT}-photo preview at ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} @ ${OUTPUT_FPS}fps`);

const photos = [];
for (let index = 0; index < PHOTO_COUNT; index += 1) {
  const file = path.join(scratch, `photo_${index}.jpg`);
  const label = (GUIDED_SHOTS[index]?.label || `Shot ${index + 1}`).replace(/:/g, ' ');

  const result = spawnSync(
    ffmpeg,
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=${COLOURS[index % COLOURS.length]}:s=3840x2160`,
      '-vf', `drawtext=text='${index + 1}. ${label}':fontsize=140:fontcolor=white:x=(w-tw)/2:y=(h-th)/2`,
      '-frames:v', '1',
      file,
    ],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    console.error(`Could not build stand-in photo ${index + 1}:`, result.stderr?.slice(-500));
    process.exit(1);
  }
  photos.push(file);
}

console.log(`Stand-in photos ready. Expected tour length: ${totalTourSeconds(PHOTO_COUNT).toFixed(1)}s`);

(async () => {
  const outputPath = path.join(outDir, 'preview.mp4');
  const started = Date.now();

  const produced = await createTourVideo({
    photoPaths: photos,
    outputPath,
    labels: GUIDED_SHOTS.slice(0, PHOTO_COUNT).map((shot) => shot.label),
    title: '4 Bedroom Duplex',
    location: 'Gwarinpa, Abuja',
  });

  if (!produced) {
    console.error('The tour was not produced. Check the warnings above.');
    process.exit(1);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const bytes = fs.statSync(produced).size;

  const probe = spawnSync(ffmpeg, ['-i', produced], { encoding: 'utf8' });
  const info = (probe.stderr || '')
    .split('\n')
    .filter((line) => /Duration|Stream/.test(line))
    .join('\n');

  console.log('');
  console.log('=== Preview ready ===');
  console.log(`File:     ${produced}`);
  console.log(`Size:     ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Encoding: ${seconds}s`);
  console.log(`Brand:    ${BRAND_NAME} | ${BRAND_DOMAIN} | ${BRAND_EMAIL} | ${BRAND_PHONE}`);
  console.log('');
  console.log(info);
  console.log('');
  console.log('Open the file above to review the intro, the crawl and the end card.');
})();
