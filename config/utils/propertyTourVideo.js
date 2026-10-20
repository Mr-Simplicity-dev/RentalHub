const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./logger');

/**
 * Automatic property tour video.
 *
 * A landlord already takes guided photos. Turning those into a short branded
 * tour gives every listing a video without asking anyone to shoot one, and
 * without uploading a heavy clip over mobile data.
 *
 * It is deliberately NOT 3D reconstruction: nothing is invented. Every frame
 * comes from a photo the landlord actually took of the real property.
 *
 * The finished clip is also an advert. It opens with a branded intro, carries a
 * news-crawl of the company contact details, and closes on a branded end card,
 * so a video screenshotted or forwarded still carries our name and number.
 *
 * Everything here is best-effort. A missing binary, a broken image or a failed
 * upload must never affect the listing itself.
 */

// 4K master. Phone screens are small, but a sharp master survives being
// re-encoded by WhatsApp, Instagram and YouTube without turning to mush.
const OUTPUT_WIDTH = 3840;
const OUTPUT_HEIGHT = 2160;
const OUTPUT_FPS = 30;

// Motion feel. Premium and snappy alternate shot to shot so the tour breathes
// instead of crawling or feeling like a slideshow.
const PREMIUM_HOLD = Math.max(2, Number(process.env.PROPERTY_TOUR_PREMIUM_HOLD) || 4.4);
const SNAPPY_HOLD = Math.max(1.5, Number(process.env.PROPERTY_TOUR_SNAPPY_HOLD) || 2.9);
const PREMIUM_ZOOM = 0.1;
const SNAPPY_ZOOM = 0.2;
const CROSSFADE = 0.7;

const INTRO_SECONDS = Math.max(2, Number(process.env.PROPERTY_TOUR_INTRO_SECONDS) || 4.2);
const OUTRO_SECONDS = Math.max(2, Number(process.env.PROPERTY_TOUR_OUTRO_SECONDS) || 5.2);

const BRAND_NAME = process.env.PLATFORM_BRAND_NAME || 'Amana RentalHub NG';
const BRAND_DOMAIN = process.env.PLATFORM_DOMAIN || 'rentalhub.com.ng';
const BRAND_EMAIL = process.env.PLATFORM_SUPPORT_EMAIL || 'support@rentalhub.com.ng';

// Each state can carry its own line, so the number is configuration, never a
// constant. PROPERTY_TOUR_PHONE is the fallback when a state has no entry.
const BRAND_PHONE = process.env.PROPERTY_TOUR_PHONE || '08030601238';

const MARK_CANDIDATES = [
  path.join(__dirname, '..', '..', 'assets', 'rentalhub-mark.png'),
  path.join(__dirname, '..', '..', 'client', 'public', 'rentalhub-mark.png'),
];

const FONT_CANDIDATES = [
  path.join(__dirname, '..', '..', 'assets', 'DejaVuSans-Bold.ttf'),
  path.join(__dirname, '..', '..', 'assets', 'DejaVuSans.ttf'),
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
];

/**
 * The guided shot order. It is the running order the landlord is prompted to
 * shoot in, and the order the video pans through, so the tour walks in from the
 * street and moves through the house instead of jumping around.
 */
const GUIDED_SHOTS = [
  { key: 'building_front', label: 'Front of the building', hint: 'Stand outside and face the main entrance.' },
  { key: 'compound', label: 'Compound / surroundings', hint: 'Show the yard, gate and parking space.' },
  { key: 'sitting_room', label: 'Sitting room', hint: 'Stand at the doorway and show the whole room.' },
  { key: 'kitchen', label: 'Kitchen', hint: 'Capture the counters and fittings.' },
  { key: 'bedroom', label: 'Bedroom', hint: 'Show the room and any wardrobe.' },
  { key: 'bathroom', label: 'Bathroom', hint: 'Show the fittings and water source.' },
  { key: 'toilet', label: 'Toilet', hint: 'Show the toilet and its condition.' },
  { key: 'street', label: 'Street outside', hint: 'Show the road and how the house is reached.' },
];

let binaryPathCache;
let binaryChecked = false;

const resolveFfmpegPath = () => {
  if (binaryChecked) return binaryPathCache;
  binaryChecked = true;

  binaryPathCache = null;

  try {
    const candidate = require('ffmpeg-static');
    if (candidate && fs.existsSync(candidate)) {
      binaryPathCache = candidate;
      return binaryPathCache;
    }
  } catch (error) {
    logger.warn(`ffmpeg-static not resolvable: ${error.message}`);
  }

  // A system ffmpeg is a fine substitute if the bundled binary did not install.
  for (const candidate of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (fs.existsSync(candidate)) {
      binaryPathCache = candidate;
      return binaryPathCache;
    }
  }

  return null;
};

const isFfmpegAvailable = () => Boolean(resolveFfmpegPath());

const findFontPath = () => FONT_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
const findMarkPath = () => MARK_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;

const escapeDrawText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '\u2019')
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');

const withFont = (filter, fontPath) =>
  fontPath ? filter.replace('drawtext=', `drawtext=fontfile='${fontPath.replace(/\\/g, '/')}':`) : filter;

/** How long each photo holds, and how far it zooms, alternating premium and snappy. */
const shotPlan = (index) => {
  const premium = index % 2 === 0;
  return {
    premium,
    hold: premium ? PREMIUM_HOLD : SNAPPY_HOLD,
    zoom: premium ? PREMIUM_ZOOM : SNAPPY_ZOOM,
  };
};

const totalTourSeconds = (photoCount) => {
  let total = 0;
  for (let index = 0; index < photoCount; index += 1) total += shotPlan(index).hold;
  // Each transition overlaps two shots by the crossfade length.
  return total - Math.max(0, photoCount - 1) * CROSSFADE;
};

/**
 * When each shot is the visible one. A shot becomes fully visible one
 * crossfade after it starts and stops being fully visible one crossfade before
 * its slot ends, which keeps the caption honest during the fades.
 */
const labelWindows = (labels) => {
  const windows = [];
  let start = 0;

  labels.forEach((label, index) => {
    const hold = shotPlan(index).hold;
    const from = index === 0 ? 0 : start + CROSSFADE;
    const to = start + hold - (index === labels.length - 1 ? 0 : CROSSFADE);

    windows.push({ label, from: Number(from.toFixed(2)), to: Number(Math.max(from, to).toFixed(2)) });
    start += hold - CROSSFADE;
  });

  return windows;
};

const runProcess = (binary, args, { timeoutMs = 300000 } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Video encoding timed out'));
    }, timeoutMs);

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      // Keep only the tail; ffmpeg is very chatty.
      if (stderr.length > 8000) stderr = stderr.slice(-4000);
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-600)}`));
    });
  });

/**
 * The branded intro. The mark drops in from above while turning a full circle
 * and settles, then the property title and location fade up beneath it.
 *
 * The mark is padded to its own diagonal before rotating: ffmpeg evaluates the
 * rotate filter's output size once, at setup, so a size that depends on `t`
 * fails. Padding to a fixed square keeps every angle inside the frame.
 */
const buildIntroArgs = ({
  outputPath,
  markPath,
  title = '',
  location = '',
  fontPath = null,
}) => {
  const markSize = 720;
  const canvas = Math.ceil(markSize * 1.5);
  const spin = '2*PI*t/2.2';

  const filters = [
    `[1:v]format=rgba,scale=${markSize}:${markSize},` +
      `pad=${canvas}:${canvas}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
      `rotate=${spin}:c=none:ow=${canvas}:oh=${canvas},` +
      // A soft lift as it lands so the mark reads as solid, not pasted on.
      `format=rgba,fade=t=in:st=0:d=0.35:alpha=1[spin]`,
    // Fall from far above, then a small settle overshoot on landing.
    `[0:v][spin]overlay=x='(W-w)/2':` +
      `y='if(lt(t,1.9), -${canvas + 400} + ((H-h)/2 + ${canvas + 400})*min(1,t/1.9)*1.05, ` +
      `if(lt(t,2.2), (H-h)/2 - 34*(2.2-t)/0.3, (H-h)/2))':format=auto[landed]`,
    // Vignette focuses the eye on the centre of the card.
    `[landed]vignette=PI/4.6[card]`,
  ];

  let last = 'card';

  if (title) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(title)}':fontsize=96:fontcolor=white:` +
          `x=(w-tw)/2:y=h-330:alpha='min(1,max(0,(t-2.25)/0.7))':` +
          `shadowcolor=black@0.7:shadowx=3:shadowy=3[t1]`,
        fontPath
      )
    );
    last = 't1';
  }

  if (location) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(location)}':fontsize=52:fontcolor=0xfacc15:` +
          `x=(w-tw)/2:y=h-215:alpha='min(1,max(0,(t-2.7)/0.7))':` +
          `shadowcolor=black@0.7:shadowx=2:shadowy=2[t2]`,
        fontPath
      )
    );
    last = 't2';
  }

  // A gold hairline that draws itself out under the title block.
  filters.push(
    `[${last}]drawbox=x='(w-900)/2':y=h-120:w='min(900,max(0,(t-2.9)*1400))':h=5:` +
      `color=0xfacc15@0.95:t=fill[t3]`
  );
  last = 't3';

  return [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x0b1220:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${INTRO_SECONDS}:r=${OUTPUT_FPS}`,
    '-loop', '1', '-t', String(INTRO_SECONDS), '-i', markPath,
    '-filter_complex', filters.join(';'),
    '-map', `[${last}]`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
    outputPath,
  ];
};

/** The branded end card: mark, name, and every way to reach us, fading up. */
const buildOutroArgs = ({ outputPath, markPath, fontPath, phone }) => {
  const markSize = 460;
  const filters = [
    `[1:v]format=rgba,scale=${markSize}:${markSize}[mark]`,
    `[0:v][mark]overlay=x='(W-w)/2':y='240 - 190*exp(-2.6*t)':format=auto[b1]`,
  ];

  const lines = [
    { text: BRAND_NAME, size: 108, colour: 'white', y: 800, from: 0.8 },
    { text: `${BRAND_DOMAIN}   |   ${BRAND_EMAIL}`, size: 54, colour: '0xfacc15', y: 980, from: 1.4 },
    { text: `Call or WhatsApp: ${phone}`, size: 60, colour: 'white', y: 1090, from: 2.0 },
  ];

  let last = 'b1';
  lines.forEach((line, index) => {
    const next = `o${index}`;
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(line.text)}':fontsize=${line.size}:fontcolor=${line.colour}:` +
          `x=(w-tw)/2:y=${line.y}:alpha='min(1,max(0,(t-${line.from})/0.7))':` +
          `shadowcolor=black@0.7:shadowx=3:shadowy=3[${next}]`,
        fontPath
      )
    );
    last = next;
  });

  filters.push(
    `[${last}]drawbox=x='(w-1100)/2':y=930:w='min(1100,max(0,(t-1.15)*1500))':h=5:color=0xfacc15@0.95:t=fill[oLine]`
  );
  filters.push(`[oLine]vignette=PI/4.8[v]`);

  return [
    '-y',
    '-f', 'lavfi', '-i', `color=c=0x0b1220:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${OUTRO_SECONDS}:r=${OUTPUT_FPS}`,
    '-loop', '1', '-t', String(OUTRO_SECONDS), '-i', markPath,
    '-filter_complex', filters.join(';'),
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
    outputPath,
  ];
};

const makeScratchDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'property-tour-'));

const cleanupScratchDir = (dir) => {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    logger.warn(`Property tour scratch cleanup failed: ${error.message}`);
  }
};

const encodeSegment = async (binary, args, label, reqLogger) => {
  try {
    await runProcess(binary, args, { timeoutMs: 420000 });
    return true;
  } catch (error) {
    reqLogger.warn?.(`Property tour ${label} failed: ${error.message}`);
    return false;
  }
};

/**
 * Build the branded mp4. `photoPaths` is an ordered array of local file paths.
 * Returns the output path, or null if the tour could not be built.
 */
const createTourVideo = async ({
  photoPaths,
  outputPath,
  labels = [],
  title = '',
  location = '',
  phone = BRAND_PHONE,
  logger: reqLogger = logger,
}) => {
  const binary = resolveFfmpegPath();
  if (!binary) {
    reqLogger.warn?.('Property tour skipped: no ffmpeg binary available');
    return null;
  }

  if (!Array.isArray(photoPaths) || photoPaths.length < 2) {
    // A single still is not a tour; the listing already shows the photo.
    return null;
  }

  const fontPath = findFontPath();
  const markPath = findMarkPath();
  const scratch = makeScratchDir();

  try {
    const frames = photoPaths.length;

    // 1. The tour body with watermark and crawl.
    const tourInputs = ['-y'];
    photoPaths.forEach((photoPath, index) => {
      tourInputs.push('-loop', '1', '-t', String(shotPlan(index).hold + CROSSFADE), '-i', photoPath);
    });
    if (markPath) tourInputs.push('-loop', '1', '-t', String(totalTourSeconds(frames)), '-i', markPath);

    const filters = [];
    for (let index = 0; index < frames; index += 1) {
      const plan = shotPlan(index);
      const zoomEnd = (1 + plan.zoom).toFixed(4);
      const overscanW = Math.round(OUTPUT_WIDTH * 1.25);
      const overscanH = Math.round(OUTPUT_HEIGHT * 1.25);
      // Zoom rate is derived from the hold so both feels travel the same
      // distance; only the speed differs.
      const rate = (plan.zoom / (plan.hold * OUTPUT_FPS)).toFixed(8);

      filters.push(
        `[${index}:v]scale=${overscanW}:${overscanH}:force_original_aspect_ratio=increase,` +
          `crop=${overscanW}:${overscanH},` +
          `zoompan=z='min(1+${rate}*on,${zoomEnd})':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${Math.round(plan.hold * OUTPUT_FPS)}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS},` +
          `trim=duration=${plan.hold.toFixed(2)},setpts=PTS-STARTPTS[v${index}]`
      );
    }

    let assembled = 'v0';
    let elapsed = shotPlan(0).hold;
    for (let index = 1; index < frames; index += 1) {
      const next = `x${index}`;
      filters.push(
        `[${assembled}][v${index}]xfade=transition=fade:duration=${CROSSFADE}:` +
          `offset=${(elapsed - CROSSFADE).toFixed(2)}[${next}]`
      );
      assembled = next;
      elapsed += shotPlan(index).hold - CROSSFADE;
    }

    const tourDuration = totalTourSeconds(frames);

    // 2. Persistent layer: dark strip, per-shot label, contact crawl.
    const crawlOnce = [BRAND_NAME, BRAND_DOMAIN, BRAND_EMAIL, `Call or WhatsApp ${phone}`].join(
      '     \u2022     '
    );
    const crawl = `${crawlOnce}     \u2022     ${crawlOnce}     \u2022     `;

    let layered = assembled;
    filters.push(`[${layered}]drawbox=x=0:y=h-190:w=iw:h=190:color=0x0b1220@0.78:t=fill[strip]`);
    layered = 'strip';

    if (labels.length) {
      // The active shot's label. drawtext can only render one string, so the
      // labels are drawn as separate layers, each switched on only during its
      // own shot. Windows are computed from the same holds as the zoom, so the
      // label and the picture never drift apart.
      const windows = labelWindows(labels);
      windows.forEach((win, index) => {
        const alpha =
          `if(lt(t,${win.from}),0,if(lt(t,${win.to}),1,0))`;
        const next = `lab${index}`;
        filters.push(
          withFont(
            `[${layered}]drawtext=text='${escapeDrawText(win.label)}':fontsize=64:fontcolor=0xfacc15:` +
              `x=70:y=h-172:alpha='${alpha}':shadowcolor=black@0.6:shadowx=2:shadowy=2[${next}]`,
            fontPath
          )
        );
        layered = next;
      });
    }

    filters.push(
      withFont(
        `[${layered}]drawtext=text='${escapeDrawText(crawl)}':fontsize=58:fontcolor=white:` +
          `x='W-mod(t*260\\,W+tw)':y=h-124:shadowcolor=black@0.6:shadowx=2:shadowy=2[crawlout]`,
        fontPath
      )
    );
    layered = 'crawlout';

    if (markPath) {
      filters.push(`[${frames}:v]format=rgba,scale=230:230,colorchannelmixer=aa=0.9[mark]`);
      filters.push(
        `[${layered}][mark]overlay=x='W-w-70':y='70':format=auto[wm]`
      );
      layered = 'wm';
    }

    const tourPath = path.join(scratch, 'tour_body.mp4');
    const tourArgs = [
      ...tourInputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${layered}]`,
      '-t', tourDuration.toFixed(2),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
      tourPath,
    ];

    const tourOk = await encodeSegment(binary, tourArgs, 'body', reqLogger);
    if (!tourOk || !fs.existsSync(tourPath)) return null;

    // 3. Intro and outro, then join all three into one file.
    let introPath = null;
    let outroPath = null;

    if (markPath) {
      const introCandidate = path.join(scratch, 'intro.mp4');
      const outroCandidate = path.join(scratch, 'outro.mp4');

      if (await encodeSegment(binary, buildIntroArgs({ outputPath: introCandidate, markPath, title, location, fontPath }), 'intro', reqLogger)) {
        introPath = introCandidate;
      }
      if (await encodeSegment(binary, buildOutroArgs({ outputPath: outroCandidate, markPath, fontPath, phone }), 'outro', reqLogger)) {
        outroPath = outroCandidate;
      }
    }

    return await joinSegments({
      binary,
      outputPath,
      segments: [introPath, tourPath, outroPath].filter(Boolean),
      reqLogger,
    });
  } catch (error) {
    reqLogger.warn?.(`Property tour encoding failed: ${error.message}`);
    return null;
  } finally {
    cleanupScratchDir(scratch);
  }
};

const joinSegments = async ({ binary, outputPath, segments, reqLogger }) => {
  if (!segments.length) return null;
  if (segments.length === 1) {
    fs.copyFileSync(segments[0], outputPath);
    return fs.existsSync(outputPath) ? outputPath : null;
  }

  const listFile = path.join(path.dirname(segments[0]), 'concat.txt');
  fs.writeFileSync(
    listFile,
    segments.map((segment) => `file '${segment.replace(/\\/g, '/')}'`).join('\n')
  );

  // Re-encode on join rather than stream-copy: the three parts are encoded
  // separately and a copy can leave timestamps that stall some phone players.
  const ok = await encodeSegment(
    binary,
    [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
      outputPath,
    ],
    'join',
    reqLogger
  );

  if (!ok) return null;
  return fs.existsSync(outputPath) ? outputPath : null;
};

module.exports = {
  createTourVideo,
  isFfmpegAvailable,
  makeScratchDir,
  cleanupScratchDir,
  resolveFfmpegPath,
  findMarkPath,
  findFontPath,
  buildIntroArgs,
  buildOutroArgs,
  shotPlan,
  labelWindows,
  totalTourSeconds,
  GUIDED_SHOTS,
  PREMIUM_HOLD,
  SNAPPY_HOLD,
  INTRO_SECONDS,
  OUTRO_SECONDS,
  BRAND_NAME,
  BRAND_DOMAIN,
  BRAND_EMAIL,
  BRAND_PHONE,
  OUTPUT_WIDTH,
  OUTPUT_HEIGHT,
  OUTPUT_FPS,
};
