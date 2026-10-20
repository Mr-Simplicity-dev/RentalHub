const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveFfmpegPath } = require('./config/utils/propertyTourVideo');

const ffmpeg = resolveFfmpegPath();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-premium-'));
console.log('ffmpeg:', ffmpeg);
console.log('scratch:', scratch);

const W = 1280;
const H = 720;

// --- 1. Make 3 background photos ---
const colours = ['0x1d4ed8', '0x0f766e', '0x7c2d12'];
const photos = colours.map((colour, i) => {
  const out = path.join(scratch, `photo_${i}.jpg`);
  const r = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', `color=c=${colour}:s=1600x900`, '-frames:v', '1', out,
  ], { encoding: 'utf8' });
  if (r.status !== 0) { console.log('photo fail:', r.stderr?.slice(-300)); process.exit(1); }
  return out;
});
console.log('photos:', photos.length);

// --- 2. Make a logo PNG (we cannot read the SVG, so stand in a circle+square) ---
const logo = path.join(scratch, 'logo.png');
spawnSync(ffmpeg, [
  '-y', '-f', 'lavfi', '-i', 'color=c=0xfacc15:s=360x360',
  '-vf', 'format=rgba,geq=r=250:g=204:b=21:a=255*lt(hypot(X-180,Y-180),170)',
  '-frames:v', '1', logo,
], { encoding: 'utf8' });

// --- 3. THE INTRO: logo falls from above + spins 360 degrees ---
// The logo is scaled so it starts big and shrinks as it lands (perspective from
// falling toward the viewer), then a full rotation over the intro.
const introPath = path.join(scratch, 'intro.mp4');
const introArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x0f172a:s=${W}x${H}:d=4:r=30`,
  '-loop', '1', '-t', '4', '-i', logo,
  '-filter_complex',
    [
      // Spin the logo a full 360 degrees and let it settle.
      `[1:v]format=rgba,scale=520:520,rotate=2*PI*t/2.6:c=none:ow=rotw(2*PI*t/2.6):oh=roth(2*PI*t/2.6)[spin]`,
      // Fall in from above: y goes from far above the frame to centre, with a
      // brief overshoot so it feels like it lands rather than just stops.
      `[spin]overlay=x='(W-w)/2':y='if(lt(t,2.2), -560 + (H-520)/2*min(1,t/2.2)*1.08, if(lt(t,2.5), (H-520)/2 - 28*(2.5-t)/0.3, (H-520)/2))':shortest=0[intro]`,
      `[0:v][intro]overlay=0:0:format=auto[v]`,
    ].join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30',
  introPath,
];
const introRun = spawnSync(ffmpeg, introArgs, { encoding: 'utf8' });
console.log('INTRO status:', introRun.status);
if (introRun.status !== 0) console.log('INTRO ERR:', introRun.stderr?.slice(-1200));
else {
  const s = fs.statSync(introPath).size;
  console.log('INTRO size:', s);
}

// --- 4. THE TICKER: contact details scrolling like a news crawl ---
const tickerPath = path.join(scratch, 'ticker.mp4');
const crawl = 'rentalhub.com.ng     *     support@rentalhub.com.ng     *     +234 800 000 0000     *     Amana RentalHub NG     *     ';
const tickerArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x111827:s=${W}x${H}:d=6:r=30`,
  '-filter_complex',
    [
      // Text is very wide; slide it from off-screen right to off-screen left.
      `[0:v]drawtext=text='${crawl}':fontsize=46:fontcolor=white:x='W-mod(t*180\\,W+tw)':y=H-90[int]`,
    ].join(';'),
  '-map', '[int]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30',
  tickerPath,
];
const tickRun = spawnSync(ffmpeg, tickerArgs, { encoding: 'utf8' });
console.log('TICKER status:', tickRun.status);
if (tickRun.status !== 0) console.log('TICKER ERR:', tickRun.stderr?.slice(-1200));
else console.log('TICKER size:', fs.statSync(tickerPath).size);

// Probe results
for (const [name, file] of [['INTRO', introPath], ['TICKER', tickerPath]]) {
  if (!fs.existsSync(file)) continue;
  const p = spawnSync(ffmpeg, ['-i', file], { encoding: 'utf8' });
  const info = (p.stderr || '').split('\n').filter((l) => /Duration|Stream/.test(l));
  console.log(`--- ${name} ---`);
  console.log(info.join('\n'));
}

fs.rmSync(scratch, { recursive: true, force: true });
