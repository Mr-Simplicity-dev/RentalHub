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
// Output resolution. Default 4K; set PROPERTY_TOUR_RESOLUTION=8k for the
// 7680x4320 master. 8K encoding is roughly four times the work of 4K, so it is
// opt-in rather than the default.
const RESOLUTION = String(process.env.PROPERTY_TOUR_RESOLUTION || '4k').toLowerCase();
const RESOLUTIONS = {
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
  '8k': { width: 7680, height: 4320 },
};
const CHOSEN = RESOLUTIONS[RESOLUTION] || RESOLUTIONS['4k'];

const OUTPUT_WIDTH = CHOSEN.width;
const OUTPUT_HEIGHT = CHOSEN.height;
const OUTPUT_FPS = 30;

// Output format profiles for multi-aspect rendering (16:9, 9:16, 4:5)
// Controlled via PROPERTY_TOUR_OUTPUT_FORMATS (comma-separated). Master is still 4K.
const OUTPUT_FORMATS_RAW = String(process.env.PROPERTY_TOUR_OUTPUT_FORMATS || '16:9').toLowerCase();
const OUTPUT_PROFILES = {
  '16:9': { width: 1920, height: 1080, label: 'landscape' },
  '9:16': { width: 1080, height: 1920, label: 'vertical' },
  '4:5': { width: 1080, height: 1350, label: 'portrait_feed' },
};
const ENABLED_FORMATS = OUTPUT_FORMATS_RAW.split(',').map(s => s.trim()).filter(s => OUTPUT_PROFILES[s]);

// Motion feel. Premium and snappy alternate shot to shot so the tour breathes
// instead of crawling or feeling like a slideshow.
const PREMIUM_HOLD = Math.max(2, Number(process.env.PROPERTY_TOUR_PREMIUM_HOLD) || 4.4);
const SNAPPY_HOLD = Math.max(1.5, Number(process.env.PROPERTY_TOUR_SNAPPY_HOLD) || 2.9);
const PREMIUM_ZOOM = 0.1;
const SNAPPY_ZOOM = 0.2;
const CROSSFADE = 0.7;

// Shot-type based movement profiles (deterministic). Prefer restrained motion.
const SHOT_MOVEMENT = {
  building_front: { hold: PREMIUM_HOLD + 0.4, zoom: PREMIUM_ZOOM * 0.8, pan: 'push_in' },
  compound: { hold: PREMIUM_HOLD + 0.2, zoom: PREMIUM_ZOOM * 0.6, pan: 'horizontal' },
  sitting_room: { hold: PREMIUM_HOLD, zoom: PREMIUM_ZOOM, pan: 'drift' },
  kitchen: { hold: SNAPPY_HOLD + 0.3, zoom: PREMIUM_ZOOM * 0.7, pan: 'reveal' },
  bedroom: { hold: PREMIUM_HOLD, zoom: PREMIUM_ZOOM * 0.6, pan: 'push_in' },
  bathroom: { hold: SNAPPY_HOLD - 0.2, zoom: 0.05, pan: 'minimal' },
  toilet: { hold: SNAPPY_HOLD - 0.3, zoom: 0.03, pan: 'minimal' },
  street: { hold: PREMIUM_HOLD + 0.3, zoom: 0.08, pan: 'panoramic' },
};
const DEFAULT_SHOT_MOVEMENT = { hold: SNAPPY_HOLD, zoom: SNAPPY_ZOOM, pan: 'ken_burns' };

// Where the crop window sits when a photo's aspect does not match the output.
// Exteriors bias upward so roofs are not cut and pavement is not wasted;
// interiors bias slightly low so floors and furniture stay in frame.
const CROP_BIAS = {
  building_front: 0.32,
  compound: 0.36,
  street: 0.34,
  sitting_room: 0.42,
  kitchen: 0.44,
  bedroom: 0.4,
  bathroom: 0.46,
  toilet: 0.46,
};
const DEFAULT_CROP_BIAS = 0.4;
const ENHANCE_PHOTOS =
  String(process.env.PROPERTY_TOUR_ENHANCE_PHOTOS || 'true').toLowerCase() !== 'false';

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
  { key: 'building_front', label: 'Front of the building', hint: 'Stand far enough back to show the full building. Keep the phone horizontal and level.' },
  { key: 'compound', label: 'Compound / surroundings', hint: 'Show the gate, parking/yard and entrance clearly. Keep level and avoid cutting off the gate.' },
  { key: 'sitting_room', label: 'Sitting room', hint: 'Stand near a corner or doorway and capture as much of the room as possible. Keep horizontal.' },
  { key: 'kitchen', label: 'Kitchen', hint: 'Show the cooking area, counters, sink and visible fittings. Keep steady and level.' },
  { key: 'bedroom', label: 'Bedroom', hint: 'Capture the whole room from a corner or doorway. Show wardrobes if visible.' },
  { key: 'bathroom', label: 'Bathroom', hint: 'Show visible bathroom fittings and water points. Keep steady and avoid close-up only shots.' },
  { key: 'toilet', label: 'Toilet', hint: 'Show the toilet area clearly and level.' },
  { key: 'street', label: 'Street outside', hint: 'Show the access road and immediate surroundings to show how the house is reached.' },
];

const getCropBias = (shotKey) => CROP_BIAS[shotKey] ?? DEFAULT_CROP_BIAS;

const getShotMovement = (shotKey, index) => {
  if (shotKey && SHOT_MOVEMENT[shotKey]) {
    return SHOT_MOVEMENT[shotKey];
  }
  return DEFAULT_SHOT_MOVEMENT;
};

/**
 * Per-property-type intro themes.
 *
 * A duplex should not open like a single room. Each theme changes the card's
 * colours and the tagline under the title, so the video feels made for that
 * kind of home rather than stamped out from one template.
 *
 * Keep the keys in step with PROPERTY_TYPES on the web (AddProperty.jsx).
 */
const INTRO_THEMES = {
  apartment: { background: '0x0b1220', accent: '0x38bdf8', tagline: 'Apartment living' },
  house: { background: '0x0b1220', accent: '0xfacc15', tagline: 'Family home' },
  bungalow: { background: '0x101a12', accent: '0x22c55e', tagline: 'Single-storey comfort' },
  duplex: { background: '0x0b1220', accent: '0x38bdf8', tagline: 'Two floors, more room' },
  studio: { background: '0x140f1f', accent: '0xa855f7', tagline: 'Smart use of space' },
  flat: { background: '0x0b1220', accent: '0x38bdf8', tagline: 'Easy city living' },
  room: { background: '0x1a1206', accent: '0xf59e0b', tagline: 'Affordable and ready' },
};

const DEFAULT_THEME = { background: '0x0b1220', accent: '0xfacc15', tagline: 'Now available' };

const resolveIntroTheme = (propertyType) => {
  const key = String(propertyType || '').trim().toLowerCase();
  return INTRO_THEMES[key] || DEFAULT_THEME;
};

/**
 * Money as a viewer reads it: "3.5 million naira per year" rather than
 * "3500000.00". The overlay is small, so a short readable form matters.
 */
const formatPriceShort = (amount) => {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return '';

  const format = (n) => {
    const rounded = Math.round(n * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  };

  if (value >= 1_000_000_000) return `${format(value / 1_000_000_000)} billion naira`;
  if (value >= 1_000_000) return `${format(value / 1_000_000)} million naira`;
  if (value >= 1_000) return `${format(value / 1_000)} thousand naira`;
  return `${Math.round(value)} naira`;
};

/** The one-line facts strip: price, bedrooms, bathrooms, type. */
const buildFactsLine = ({ rentAmount, paymentFrequency, bedrooms, bathrooms, propertyType }) => {
  const parts = [];

  const price = formatPriceShort(rentAmount);
  if (price) {
    const per =
      String(paymentFrequency || 'yearly').toLowerCase() === 'monthly' ? 'per month' : 'per year';
    parts.push(`${price} ${per}`);
  }

  const rooms = Number(bedrooms);
  if (Number.isFinite(rooms) && rooms > 0) parts.push(`${rooms} bedroom${rooms === 1 ? '' : 's'}`);

  const baths = Number(bathrooms);
  if (Number.isFinite(baths) && baths > 0) parts.push(`${baths} bathroom${baths === 1 ? '' : 's'}`);

  if (propertyType) parts.push(String(propertyType));

  return parts.join('   \u2022   ');
};

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

/** How long each photo holds, and how far it zooms. Prefer shot-type based movement. */
const shotPlan = (index, shotKey) => {
  const movement = getShotMovement(shotKey, index);
  const premium = movement.hold >= PREMIUM_HOLD * 0.9;
  return {
    premium,
    hold: movement.hold,
    zoom: movement.zoom,
    pan: movement.pan,
  };
};

const totalTourSeconds = (photoCount, labels = []) => {
  let total = 0;
  for (let index = 0; index < photoCount; index += 1) {
    const shotKey = labels[index]?.key || labels[index];
    total += shotPlan(index, shotKey).hold;
  }
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
    const shotKey = typeof label === 'object' ? label.key : undefined;
    const labelText = typeof label === 'object' ? label.label : label;
    const hold = shotPlan(index, shotKey).hold;
    const from = index === 0 ? 0 : start + CROSSFADE;
    const to = start + hold - (index === labels.length - 1 ? 0 : CROSSFADE);

    windows.push({ label: labelText, from: Number(from.toFixed(2)), to: Number(Math.max(from, to).toFixed(2)) });
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
 * Concatenates the per-scene voice clips into one narration track, with a short
 * pause between scenes. Returns null when there is nothing usable, because a
 * missing voice track must never fail the tour.
 */
const buildNarrationTrack = async ({
  binary,
  segmentPaths,
  outputPath,
  gapSeconds = 0.35,
  logger: reqLogger = logger,
}) => {
  const usable = (Array.isArray(segmentPaths) ? segmentPaths : []).filter(
    (segment) => segment && fs.existsSync(segment)
  );
  if (!usable.length) return null;

  const scratch = path.dirname(outputPath);
  const gapPath = path.join(scratch, 'narration_gap.wav');

  try {
    await runProcess(binary, [
      '-y',
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-t', String(gapSeconds),
      '-c:a', 'pcm_s16le',
      gapPath,
    ], { timeoutMs: 30000 });
  } catch (error) {
    reqLogger.warn?.(`Property tour voice: could not build scene pause: ${error.message}`);
    return null;
  }

  const listFile = path.join(scratch, 'narration.txt');
  const lines = [];
  usable.forEach((segment, index) => {
    lines.push(`file '${segment.replace(/\\/g, '/')}'`);
    if (index < usable.length - 1) {
      lines.push(`file '${gapPath.replace(/\\/g, '/')}'`);
    }
  });
  fs.writeFileSync(listFile, lines.join('\n'));

  try {
    await runProcess(binary, [
      '-y',
      '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2',
      outputPath,
    ], { timeoutMs: 120000 });
  } catch (error) {
    reqLogger.warn?.(`Property tour voice: narration track could not be joined: ${error.message}`);
    return null;
  }

  return fs.existsSync(outputPath) ? outputPath : null;
};

/**
 * Mixes the approved music bed and (optionally) the narration over the finished
 * silent tour. Music is ducked under the voice so the words stay intelligible.
 * Any failure returns the silent master so the video still ships.
 */
const mixTourAudio = async ({
  binary,
  videoPath,
  musicPath,
  narrationPath,
  settings = {},
  duration = 0,
  voiceDelaySeconds = 0,
  outputPath,
  logger: reqLogger = logger,
}) => {
  const hasMusic = Boolean(musicPath && fs.existsSync(musicPath));
  const hasVoice = Boolean(narrationPath && fs.existsSync(narrationPath));
  if (!hasMusic && !hasVoice) return videoPath;

  const safeDuration = Number(duration) > 0 ? Number(duration) : 0;
  const musicVolume = Number.isFinite(Number(settings.volume)) ? Number(settings.volume) : 0.25;
  const duckingEnabled = settings.ducking !== false;
  const fadeIn = Math.min(1.6, Math.max(0.4, safeDuration / 12));
  const fadeOut = Math.min(2.4, Math.max(0.6, safeDuration / 8));
  const fadeStart = Math.max(0, safeDuration - fadeOut);
  const voiceDelayMs = Math.max(0, Math.round(Number(voiceDelaySeconds) * 1000));

  const args = ['-y', '-i', videoPath];
  let musicIndex = null;
  let voiceIndex = null;
  let nextIndex = 1;

  if (hasMusic) {
    args.push('-stream_loop', '-1', '-i', musicPath);
    musicIndex = nextIndex;
    nextIndex += 1;
  }
  if (hasVoice) {
    args.push('-i', narrationPath);
    voiceIndex = nextIndex;
    nextIndex += 1;
  }

  const trim = safeDuration > 0 ? `,atrim=0:${safeDuration.toFixed(2)}` : '';
  const filters = [];
  const musicChain =
    `[${musicIndex}:a]volume=${musicVolume.toFixed(3)}${trim},` +
    `afade=t=in:st=0:d=${fadeIn.toFixed(2)}` +
    (safeDuration > 0 ? `,afade=t=out:st=${fadeStart.toFixed(2)}:d=${fadeOut.toFixed(2)}` : '');

  if (hasMusic && hasVoice) {
    const pad = safeDuration > 0 ? `,apad=whole_dur=${safeDuration}` : '';
    filters.push(`[${voiceIndex}:a]adelay=${voiceDelayMs}|${voiceDelayMs}${pad},asplit=2[voice][sidechain]`);
    filters.push(`${musicChain}[musicraw]`);
    if (duckingEnabled) {
      filters.push(
        `[musicraw][sidechain]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[musicducked]`
      );
      filters.push(
        `[musicducked][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
      );
    } else {
      filters.push(
        `[musicraw][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
      );
    }
  } else if (hasMusic) {
    filters.push(`${musicChain}[aout]`);
  } else {
    filters.push(`[${voiceIndex}:a]adelay=${voiceDelayMs}|${voiceDelayMs},alimiter=limit=0.95[aout]`);
  }

  const mixArgs = [
    ...args,
    '-filter_complex', filters.join(';'),
    '-map', '0:v:0',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
    '-movflags', '+faststart',
  ];
  if (safeDuration > 0) mixArgs.push('-t', safeDuration.toFixed(2));
  mixArgs.push('-shortest', outputPath);

  try {
    await runProcess(binary, mixArgs, { timeoutMs: 240000 });
  } catch (error) {
    reqLogger.warn?.(`Property tour audio mix skipped: ${error.message}`);
    return videoPath;
  }

  return fs.existsSync(outputPath) ? outputPath : videoPath;
};

/**
 * Renders social-ready aspect variants from the finished master. Portrait
 * formats get a blurred fill either side of the picture rather than a crop, so
 * nothing the landlord filmed is lost. Failures are skipped, never fatal.
 */
const renderAspectVariants = async ({
  binary,
  masterPath,
  formats = ENABLED_FORMATS,
  outputDir,
  logger: reqLogger = logger,
}) => {
  const targets = (Array.isArray(formats) ? formats : [])
    .map((format) => String(format).trim())
    .filter((format) => OUTPUT_PROFILES[format] && format !== '16:9');

  const variants = [];
  for (const format of targets) {
    const profile = OUTPUT_PROFILES[format];
    const { width, height } = profile;
    const outputPath = path.join(outputDir, `tour_${format.replace(':', 'x')}.mp4`);
    const fillScale = `scale=${width}:${height}:force_original_aspect_ratio=increase`;
    const fitScale = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
    const filters =
      `[0:v]split=2[bgsrc][fgsrc];` +
      `[bgsrc]${fillScale},crop=${width}:${height},gblur=sigma=32[bgtmp];` +
      `[fgsrc]${fitScale}[fgtmp];` +
      `[bgtmp][fgtmp]overlay=(W-w)/2:(H-h)/2,format=yuv420p[vout]`;

    try {
      await runProcess(
        binary,
        [
          '-y',
          '-i', masterPath,
          '-filter_complex', filters,
          '-map', '[vout]',
          '-map', '0:a?',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '160k',
          '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
          outputPath,
        ],
        { timeoutMs: 600000 }
      );
      if (fs.existsSync(outputPath)) {
        variants.push({ format, label: profile.label, path: outputPath });
      }
    } catch (error) {
      reqLogger.warn?.(`Property tour ${format} variant skipped: ${error.message}`);
    }
  }

  return variants;
};

/**
 * Best-effort media probe. ffmpeg prints stream info to stderr even when it
 * exits non-zero for a bare `-i`, so the exit code is ignored deliberately.
 * Returns null when the dimensions cannot be read; callers treat that as
 * "unknown" rather than "invalid".
 */
const probeMediaDimensions = (binary, filePath) =>
  new Promise((resolve) => {
    if (!binary || !filePath) return resolve(null);
    const child = spawn(binary, ['-hide_banner', '-i', filePath], { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(null);
    }, 15000);

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 16000) stderr = stderr.slice(-8000);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', () => {
      clearTimeout(timer);
      const match = stderr.match(/Video:.*?,\s*(\d{2,5})x(\d{2,5})/);
      if (!match) return resolve(null);
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return resolve(null);
      resolve({ width, height });
    });
  });

/**
 * The branded intro. The mark drops in from above while turning a full circle
 * and settles, then a receipt-style panel slides up carrying the property
 * title, location and the headline facts.
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
  tagline = '',
  facts = '',
  propertyType = '',
  fontPath = null,
}) => {
  const theme = resolveIntroTheme(propertyType);
  // Proportional to the frame so 1080p, 4K and 8K all look the same.
  const scale = OUTPUT_HEIGHT / 2160;
  const markSize = Math.round(820 * scale);
  const canvas = Math.ceil(markSize * 1.5);
  const spin = '2*PI*t/2.2';
  const dropFrom = canvas + Math.round(520 * scale);

  // The receipt panel occupies the lower third and slides up into place.
  const panelTop = OUTPUT_HEIGHT - Math.round(620 * scale);
  const panelHeight = Math.round(620 * scale);

  const filters = [
    `[1:v]format=rgba,scale=${markSize}:${markSize},` +
      `pad=${canvas}:${canvas}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
      `rotate=${spin}:c=none:ow=${canvas}:oh=${canvas},` +
      // A soft lift as it lands so the mark reads as solid, not pasted on.
      `format=rgba,fade=t=in:st=0:d=0.35:alpha=1[spin]`,
    // Fall from far above, then a small settle overshoot on landing. It ends
    // higher up because the receipt panel now takes the lower third.
    `[0:v][spin]overlay=x='(W-w)/2':` +
      `y='if(lt(t,1.9), -${dropFrom} + ((${panelTop}/2-h/2) + ${dropFrom})*min(1,t/1.9)*1.05, ` +
      `if(lt(t,2.2), ${panelTop}/2-h/2 - ${Math.round(40 * scale)}*(2.2-t)/0.3, ${panelTop}/2-h/2))':format=auto[landed]`,
    // Vignette focuses the eye on the centre of the card.
    `[landed]vignette=PI/4.6[card]`,
  ];

  let last = 'card';

  // The receipt panel: a dark plate with a themed accent edge that slides up.
  // Explicit pixel geometry, because drawbox is sized once at setup and cannot
  // read a time-varying chain reliably.
  filters.push(
    `[${last}]drawbox=x=0:y='${panelTop} + max(0,${Math.round(240 * scale)}*(1-min(1,max(0,(t-1.9)/0.8))))':` +
      `w=${OUTPUT_WIDTH}:h=${panelHeight}:color=0x00000000@0:t=fill,` +
      `drawbox=x=0:y='${panelTop} + max(0,${Math.round(240 * scale)}*(1-min(1,max(0,(t-1.9)/0.8))))':` +
      `w=${OUTPUT_WIDTH}:h=${panelHeight}:color=${theme.background}@0.92:t=fill[panel]`
  );
  last = 'panel';

  // The themed accent edge runs down the left of the panel.
  filters.push(
    `[${last}]drawbox=x=0:y='${panelTop} + max(0,${Math.round(240 * scale)}*(1-min(1,max(0,(t-1.9)/0.8))))':` +
      `w=${Math.max(6, Math.round(10 * scale))}:h=${panelHeight}:color=${theme.accent}@0.95:t=fill[edge]`
  );
  last = 'edge';

  // The panel slides up over 0.8s starting at 1.9s, so all text inside shares
  // the same alpha curve and appears with the panel rather than before it.
  const panelIn = 'min(1,max(0,(t-2.15)/0.6))';

  if (tagline) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(tagline.toUpperCase())}':fontsize=${Math.round(40 * scale)}:` +
          `fontcolor=${theme.accent}:x=${Math.round(70 * scale)}:y=${panelTop + Math.round(52 * scale)}:` +
          `alpha='${panelIn}':shadowcolor=black@0.7:shadowx=2:shadowy=2[tg]`,
        fontPath
      )
    );
    last = 'tg';
  }

  if (title) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(title)}':fontsize=${Math.round(104 * scale)}:fontcolor=white:` +
          `x=${Math.round(70 * scale)}:y=${panelTop + Math.round(130 * scale)}:` +
          `alpha='${panelIn}':shadowcolor=black@0.7:shadowx=3:shadowy=3[t1]`,
        fontPath
      )
    );
    last = 't1';
  }

  if (location) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(location)}':fontsize=${Math.round(58 * scale)}:` +
          `fontcolor=${theme.accent}:x=${Math.round(70 * scale)}:y=${panelTop + Math.round(280 * scale)}:` +
          `alpha='${panelIn}':shadowcolor=black@0.7:shadowx=2:shadowy=2[t2]`,
        fontPath
      )
    );
    last = 't2';
  }

  if (facts) {
    filters.push(
      withFont(
        `[${last}]drawtext=text='${escapeDrawText(facts)}':fontsize=${Math.round(56 * scale)}:fontcolor=white:` +
          `x=${Math.round(70 * scale)}:y=${panelTop + Math.round(390 * scale)}:` +
          `alpha='${panelIn}':shadowcolor=black@0.7:shadowx=2:shadowy=2[t4]`,
        fontPath
      )
    );
    last = 't4';
  }

  // The accent hairline that draws itself out once the panel has arrived.
  filters.push(
    `[${last}]drawbox=x=${Math.round(70 * scale)}:y=${OUTPUT_HEIGHT - Math.round(150 * scale)}:` +
      `w='min(${Math.round(1200 * scale)},max(0,(t-3.0)*${Math.round(2000 * scale)}))':h=${Math.max(4, Math.round(6 * scale))}:` +
      `color=${theme.accent}@0.95:t=fill[t3]`
  );
  last = 't3';

  return [
    '-y',
    '-f', 'lavfi', '-i', `color=c=${theme.background}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:d=${INTRO_SECONDS}:r=${OUTPUT_FPS}`,
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
  // Sized for the 4K frame. Everything is expressed against the frame height so
  // the card stays balanced if the output resolution is ever changed.
  const scale = OUTPUT_HEIGHT / 2160;
  const markSize = Math.round(620 * scale);

  const filters = [
    `[1:v]format=rgba,scale=${markSize}:${markSize}[mark]`,
    `[0:v][mark]overlay=x='(W-w)/2':y='${Math.round(560 * scale)} - ${Math.round(230 * scale)}*exp(-2.6*t)':format=auto[b1]`,
  ];

  const lines = [
    { text: BRAND_NAME, size: Math.round(128 * scale), colour: 'white', y: Math.round(1340 * scale), from: 0.8 },
    {
      text: `${BRAND_DOMAIN}   |   ${BRAND_EMAIL}`,
      size: Math.round(62 * scale),
      colour: '0xfacc15',
      y: Math.round(1560 * scale),
      from: 1.4,
    },
    {
      text: `Call or WhatsApp: ${phone}`,
      size: Math.round(70 * scale),
      colour: 'white',
      y: Math.round(1690 * scale),
      from: 2.0,
    },
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
    `[${last}]drawbox=x='(w-${Math.round(1500 * scale)})/2':y=${Math.round(1490 * scale)}:` +
      `w='min(${Math.round(1500 * scale)},max(0,(t-1.15)*${Math.round(2000 * scale)}))':h=${Math.max(4, Math.round(6 * scale))}:` +
      `color=0xfacc15@0.95:t=fill[oLine]`
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
 * The slow-motion highlight reel built from the landlord's live clips.
 *
 * Each clip is set to play at half speed and scaled to the frame, then the
 * clips are cross-faded into one short segment that sits between the photo tour
 * and the end card. Clips are normalised to a fixed length so a long clip
 * cannot dominate the advert and a short one never leaves a black gap.
 */
const CLIP_SLOWDOWN = 2; // half speed
const CLIP_SLOT_SECONDS = 4;
const CLIP_SLOT_FRAMES = CLIP_SLOT_SECONDS * OUTPUT_FPS;
// A phone clip can be a minute long, but only the first few seconds can ever
// reach the tour. Reading just that much keeps memory and encode time bounded.
const CLIP_SOURCE_LIMIT_SECONDS =
  Math.max(CLIP_SLOT_SECONDS, Number(process.env.PROPERTY_TOUR_CLIP_SOURCE_SECONDS) || 12);
const STABILISE_CLIPS =
  String(process.env.PROPERTY_TOUR_STABILISE_CLIPS || 'true').toLowerCase() !== 'false';

const buildClipArgs = ({ outputPath, clipPaths, fontPath, facts = '', phone = BRAND_PHONE }) => {
  const uiScale = OUTPUT_HEIGHT / 2160;
  const stripHeight = Math.round(230 * uiScale);
  const stripY = OUTPUT_HEIGHT - stripHeight;

  const filters = [];
  const inputs = ['-y'];

  clipPaths.forEach((clipPath) => {
    // Reading only the head of the clip keeps ffmpeg simple and avoids
    // seek-accuracy surprises with clips from a phone.
    inputs.push('-t', String(CLIP_SOURCE_LIMIT_SECONDS), '-i', clipPath);
  });

  // Each clip: scale to fill, steady the handheld shake, slow to half speed,
  // pad/trim to the slot length.
  clipPaths.forEach((clipPath, index) => {
    const stabilise = STABILISE_CLIPS ? 'deshake=rx=24:ry=24,' : '';
    filters.push(
      `[${index}:v]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT},` +
        `fps=${OUTPUT_FPS},` +
        stabilise +
        `eq=brightness=0.01:contrast=1.03:saturation=1.03,` +
        `setpts=${(1 / CLIP_SLOWDOWN).toFixed(4)}*PTS,` +
        `tpad=stop_mode=clone:stop_duration=${CLIP_SLOT_SECONDS},` +
        `trim=duration=${CLIP_SLOT_SECONDS},setpts=PTS-STARTPTS[clip${index}]`
    );
  });

  let assembled = 'clip0';
  for (let index = 1; index < clipPaths.length; index += 1) {
    const next = `c${index}`;
    filters.push(
      `[${assembled}][clip${index}]xfade=transition=fade:duration=${CROSSFADE}:` +
        `offset=${(index * (CLIP_SLOT_SECONDS - CROSSFADE)).toFixed(2)}[${next}]`
    );
    assembled = next;
  }

  const clipDuration = clipPaths.length * CLIP_SLOT_SECONDS - (clipPaths.length - 1) * CROSSFADE;

  // Same branding furniture as the photo tour so the two parts feel like one film.
  filters.push(
    `[${assembled}]drawbox=x=0:y=${stripY}:w=${OUTPUT_WIDTH}:h=${stripHeight}:color=0x0b1220@0.82:t=fill[cstrip]`
  );

  const crawlOnce = [BRAND_NAME, BRAND_DOMAIN, BRAND_EMAIL, `Call or WhatsApp ${phone}`].join(
    '     \u2022     '
  );
  const crawl = `${crawlOnce}     \u2022     ${crawlOnce}     \u2022     `;

  filters.push(
    withFont(
      `[cstrip]drawtext=text='${escapeDrawText(crawl)}':fontsize=${Math.round(66 * uiScale)}:fontcolor=white:` +
        `x='W-mod(t*${Math.round(330 * uiScale)}\\,W+tw)':y=${stripY + Math.round(112 * uiScale)}:shadowcolor=black@0.6:shadowx=2:shadowy=2[ccrawl]`,
      fontPath
    )
  );

  let layered = 'ccrawl';

  if (facts) {
    filters.push(
      `[${layered}]drawbox=x=0:y=0:w=${OUTPUT_WIDTH}:h=${Math.round(150 * uiScale)}:color=0x0b1220@0.55:t=fill[cfactbar]`
    );
    filters.push(
      withFont(
        `[cfactbar]drawtext=text='${escapeDrawText(facts)}':fontsize=${Math.round(58 * uiScale)}:fontcolor=white:` +
          `x=${Math.round(80 * uiScale)}:y=${Math.round(46 * uiScale)}:shadowcolor=black@0.7:shadowx=2:shadowy=2[cfacts]`,
        fontPath
      )
    );
    layered = 'cfacts';
  }

  return [
    ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', `[${layered}]`,
    '-t', clipDuration.toFixed(2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
    outputPath,
  ];
};

/**
 * Build the branded mp4. `photoPaths` is an ordered array of local file paths.
 * Returns the output path, or null if the tour could not be built.
 */
const createTourVideo = async ({
  photoPaths,
  outputPath,
  labels = [],
  shotKeys = [],
  title = '',
  location = '',
  phone = BRAND_PHONE,
  facts = '',
  featureHighlights = [],
  propertyType = '',
  clipPaths = [],
  musicTrack = null,
  musicPath = null,
  musicSettings = {},
  narrationPath = null,
  narrationSegments = [],
  voiceEnabled = false,
  outputFormats = ENABLED_FORMATS,
  onVariant = null,
  logger: reqLogger = logger,
}) => {
  const binary = resolveFfmpegPath();
  if (!binary) {
    reqLogger.warn?.('Property tour skipped: no ffmpeg binary available');
    return null;
  }

  if (!Array.isArray(photoPaths) || photoPaths.length < 2) {
    // A single still is not a tour on its own; only clips can carry it.
    if (!Array.isArray(clipPaths) || !clipPaths.length) return null;
  }

  const fontPath = findFontPath();
  const markPath = findMarkPath();
  const scratch = makeScratchDir();

  try {
    const frames = photoPaths.length;
    const hasPhotos = frames >= 2;
    let bodyDuration = 0;

    // 1. The tour body with watermark and crawl. With fewer than two photos the
    // clip reel carries the motion, so the body is skipped rather than faked.
    let tourPath = null;

    if (hasPhotos) {
    const tourInputs = ['-y'];
    photoPaths.forEach((photoPath, index) => {
      const key = shotKeys[index] || (labels[index] && labels[index].key) || null;
      tourInputs.push('-loop', '1', '-t', String(shotPlan(index, key).hold + CROSSFADE), '-i', photoPath);
    });
    const labelObjects = labels.length && typeof labels[0] === 'object' ? labels : labels.map((l, i) => ({ label: l, key: shotKeys[i] || null }));
    if (markPath) tourInputs.push('-loop', '1', '-t', String(totalTourSeconds(frames, labelObjects)), '-i', markPath);

    const filters = [];
    for (let index = 0; index < frames; index += 1) {
      const key = shotKeys[index] || (labels[index] && labels[index].key) || null;
      const plan = shotPlan(index, key);
      const zoomEnd = (1 + plan.zoom).toFixed(4);
      const overscanW = Math.round(OUTPUT_WIDTH * 1.25);
      const overscanH = Math.round(OUTPUT_HEIGHT * 1.25);
      // Zoom rate is derived from the hold so both feels travel the same
      // distance; only the speed differs.
      const rate = (plan.zoom / (plan.hold * OUTPUT_FPS)).toFixed(8);
      const cropBias = getCropBias(key);
      const enhance = ENHANCE_PHOTOS
        ? `eq=brightness=0.015:contrast=1.04:saturation=1.04,unsharp=3:3:0.25:3:3:0,`
        : '';

      filters.push(
        `[${index}:v]scale=${overscanW}:${overscanH}:force_original_aspect_ratio=increase,` +
          `crop=${overscanW}:${overscanH}:(iw-ow)/2:(ih-oh)*${cropBias},` +
          enhance +
          `zoompan=z='min(1+${rate}*on,${zoomEnd})':` +
          `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':` +
          `d=${Math.round(plan.hold * OUTPUT_FPS)}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${OUTPUT_FPS},` +
          `trim=duration=${plan.hold.toFixed(2)},setpts=PTS-STARTPTS[v${index}]`
      );
    }

    let assembled = 'v0';
    const key0 = shotKeys[0] || (labels[0] && labels[0].key) || null;
    let elapsed = shotPlan(0, key0).hold;
    for (let index = 1; index < frames; index += 1) {
      const next = `x${index}`;
      const k = shotKeys[index] || (labels[index] && labels[index].key) || null;
      filters.push(
        `[${assembled}][v${index}]xfade=transition=fade:duration=${CROSSFADE}:` +
          `offset=${(elapsed - CROSSFADE).toFixed(2)}[${next}]`
      );
      assembled = next;
      elapsed += shotPlan(index, k).hold - CROSSFADE;
    }

    const tourDuration = totalTourSeconds(frames, labelObjects);
    bodyDuration = tourDuration;

    // 2. Persistent layer: dark strip, per-shot label, contact crawl.
    const crawlOnce = [BRAND_NAME, BRAND_DOMAIN, BRAND_EMAIL, `Call or WhatsApp ${phone}`].join(
      '     \u2022     '
    );
    const crawl = `${crawlOnce}     \u2022     ${crawlOnce}     \u2022     `;

    let layered = assembled;
    // Explicit pixel geometry. drawbox is evaluated once at setup, so a value
    // derived from the (time-varying) chain cannot be trusted here; fixed
    // numbers tie the bar to the 4K frame exactly.
    const uiScale = OUTPUT_HEIGHT / 2160;
    const stripHeight = Math.round(230 * uiScale);
    const stripY = OUTPUT_HEIGHT - stripHeight;
    filters.push(
      `[${layered}]drawbox=x=0:y=${stripY}:w=${OUTPUT_WIDTH}:h=${stripHeight}:color=0x0b1220@0.82:t=fill[strip]`
    );
    layered = 'strip';

    if (labels.length) {
      // The active shot's label. drawtext can only render one string, so the
      // labels are drawn as separate layers, each switched on only during its
      // own shot. Windows are computed from the same holds as the zoom, so the
      // label and the picture never drift apart.
      const windows = labelWindows(labelObjects);
      windows.forEach((win, index) => {
        const alpha =
          `if(lt(t,${win.from}),0,if(lt(t,${win.to}),1,0))`;
        const next = `lab${index}`;
        filters.push(
          withFont(
            `[${layered}]drawtext=text='${escapeDrawText(win.label)}':fontsize=${Math.round(74 * uiScale)}:fontcolor=0xfacc15:` +
              `x=${Math.round(80 * uiScale)}:y=${stripY + Math.round(30 * uiScale)}:alpha='${alpha}':shadowcolor=black@0.6:shadowx=2:shadowy=2[${next}]`,
            fontPath
          )
        );
        layered = next;
      });
    }

    filters.push(
      withFont(
        `[${layered}]drawtext=text='${escapeDrawText(crawl)}':fontsize=${Math.round(66 * uiScale)}:fontcolor=white:` +
          `x='W-mod(t*${Math.round(330 * uiScale)}\\,W+tw)':y=${stripY + Math.round(112 * uiScale)}:shadowcolor=black@0.6:shadowx=2:shadowy=2[crawlout]`,
        fontPath
      )
    );
    layered = 'crawlout';

    const highlightLine = (Array.isArray(featureHighlights) ? featureHighlights : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 4)
      .join('   \u2022   ');

    const hasHighlights = Boolean(highlightLine);
    const factBarHeight = Math.round((hasHighlights ? 230 : 150) * uiScale);

    if (facts || hasHighlights) {
      // Price and size stay on screen for the whole tour: a viewer deciding
      // whether the place is affordable should not have to wait for the end.
      filters.push(
        `[${layered}]drawbox=x=0:y=0:w=${OUTPUT_WIDTH}:h=${factBarHeight}:color=0x0b1220@0.55:t=fill[factbar]`
      );
      layered = 'factbar';
    }

    if (facts) {
      filters.push(
        withFont(
          `[${layered}]drawtext=text='${escapeDrawText(facts)}':fontsize=${Math.round(58 * uiScale)}:fontcolor=white:` +
            `x=${Math.round(80 * uiScale)}:y=${Math.round(46 * uiScale)}:shadowcolor=black@0.7:shadowx=2:shadowy=2[facts]`,
          fontPath
        )
      );
      layered = 'facts';
    }

    if (hasHighlights) {
      // Only features the landlord explicitly confirmed are passed in here, so
      // the chip never implies something the listing did not state.
      filters.push(
        withFont(
          `[${layered}]drawtext=text='${escapeDrawText(highlightLine)}':fontsize=${Math.round(48 * uiScale)}:fontcolor=0xfacc15:` +
            `x=${Math.round(80 * uiScale)}:y=${Math.round(facts ? 158 : 60) * uiScale}:shadowcolor=black@0.75:shadowx=2:shadowy=2[highlights]`,
          fontPath
        )
      );
      layered = 'highlights';
    }
    if (markPath) {
      const markSize = Math.round(260 * (OUTPUT_HEIGHT / 2160));
      filters.push(`[${frames}:v]format=rgba,scale=${markSize}:${markSize},colorchannelmixer=aa=0.9[mark]`);
      filters.push(
        `[${layered}][mark]overlay=x='W-w-${Math.round(80 * (OUTPUT_HEIGHT / 2160))}':y=${Math.round(80 * (OUTPUT_HEIGHT / 2160))}:format=auto[wm]`
      );
      layered = 'wm';
    }

    const bodyPath = path.join(scratch, 'tour_body.mp4');
    const tourArgs = [
      ...tourInputs,
      '-filter_complex', filters.join(';'),
      '-map', `[${layered}]`,
      '-t', tourDuration.toFixed(2),
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-r', String(OUTPUT_FPS),
      bodyPath,
    ];

    const tourOk = await encodeSegment(binary, tourArgs, 'body', reqLogger);
    if (tourOk && fs.existsSync(bodyPath)) tourPath = bodyPath;
    }

    // 3. Intro, then the slow-motion clip reel (when the landlord shot clips),
    // then the photo tour, then the outro. All joined into one file.
    let introPath = null;
    let outroPath = null;
    let clipPath = null;

    if (markPath) {
      const introCandidate = path.join(scratch, 'intro.mp4');
      const outroCandidate = path.join(scratch, 'outro.mp4');

      if (
        await encodeSegment(
          binary,
          buildIntroArgs({
            outputPath: introCandidate,
            markPath,
            title,
            location,
            tagline: resolveIntroTheme(propertyType).tagline,
            facts,
            propertyType,
            fontPath,
          }),
          'intro',
          reqLogger
        )
      ) {
        introPath = introCandidate;
      }
      if (await encodeSegment(binary, buildOutroArgs({ outputPath: outroCandidate, markPath, fontPath, phone }), 'outro', reqLogger)) {
        outroPath = outroCandidate;
      }
    }

    if (Array.isArray(clipPaths) && clipPaths.length) {
      const clipCandidate = path.join(scratch, 'clips.mp4');
      if (
        await encodeSegment(
          binary,
          buildClipArgs({ outputPath: clipCandidate, clipPaths, fontPath, facts, phone }),
          'clips',
          reqLogger
        )
      ) {
        clipPath = clipCandidate;
      }
    }

    const joined = await joinSegments({
      binary,
      outputPath,
      segments: [introPath, tourPath, clipPath, outroPath].filter(Boolean),
      reqLogger,
    });

    if (!joined) return null;

    // Audio is added last, on the finished film. Every step is optional: a
    // property with no approved music, no voice provider or a broken mix still
    // publishes with a silent video rather than no video.
    const clipDuration = clipPath
      ? Math.max(
          0,
          downloadedClips.length * CLIP_SLOT_SECONDS - Math.max(0, downloadedClips.length - 1) * CROSSFADE
        )
      : 0;
    const estimatedDuration =
      (introPath ? INTRO_SECONDS : 0) +
      bodyDuration +
      clipDuration +
      (outroPath ? OUTRO_SECONDS : 0);

    const resolvedMusicPath = musicPath || (musicTrack && musicTrack.local_path) || null;
    const mixed = await mixTourAudio({
      binary,
      videoPath: joined,
      musicPath: resolvedMusicPath,
      narrationPath: voiceEnabled ? narrationPath : null,
      settings: {
        volume: musicTrack?.volume ?? musicSettings.volume,
        ducking: musicTrack?.ducking ?? musicSettings.ducking,
      },
      duration: estimatedDuration,
      voiceDelaySeconds: introPath ? INTRO_SECONDS : 0,
      outputPath: path.join(scratch, 'tour_mixed.mp4'),
      logger: reqLogger,
    });

    if (typeof onVariant === 'function' && mixed) {
      const variants = await renderAspectVariants({
        binary,
        masterPath: mixed,
        formats: outputFormats,
        outputDir: scratch,
        logger: reqLogger,
      });
      for (const variant of variants) {
        try {
          await onVariant(variant);
        } catch (variantError) {
          reqLogger.warn?.(`Property tour ${variant.format} variant upload skipped: ${variantError.message}`);
        }
      }
    }

    return mixed;
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
  buildClipArgs,
  buildNarrationTrack,
  mixTourAudio,
  renderAspectVariants,
  probeMediaDimensions,
  getCropBias,
  shotPlan,
  labelWindows,
  totalTourSeconds,
  GUIDED_SHOTS,
  INTRO_THEMES,
  DEFAULT_THEME,
  resolveIntroTheme,
  getShotMovement,
  SHOT_MOVEMENT,
  DEFAULT_SHOT_MOVEMENT,
  formatPriceShort,
  buildFactsLine,
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
  OUTPUT_PROFILES,
  ENABLED_FORMATS,
};
