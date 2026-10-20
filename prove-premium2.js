const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveFfmpegPath } = require('./config/utils/propertyTourVideo');

const ffmpeg = resolveFfmpegPath();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-logo-'));
const W = 1280, H = 720;

// A proper transparent-background logo PNG: blue rounded square + yellow pin.
// ffmpeg CAN read PNG; the earlier failure was my geq alpha filter, not PNG.
const logo = path.join(scratch, 'logo.png');
const mk = spawnSync(ffmpeg, [
  '-y',
  '-f', 'lavfi', '-i', 'color=c=0x2563eb:s=512x512:d=1',
  '-f', 'lavfi', '-i', 'color=c=0xfacc15:s=512x512:d=1',
  '-filter_complex',
    `[0:v]format=rgba,geq=r=37:g=99:b=235:a='255*lt(hypot(X-256,Y-256),240)'[bg];` +
    `[1:v]format=rgba,geq=r=250:g=204:b=21:a='255*lt(hypot(X-256,Y-256),120)'[pin];` +
    `[bg][pin]overlay=0:0[out]`,
  '-map', '[out]', '-frames:v', '1', logo,
], { encoding: 'utf8' });
console.log('logo make status:', mk.status);
if (mk.status !== 0) console.log('logo err:', mk.stderr?.slice(-700));
console.log('logo exists:', fs.existsSync(logo), fs.existsSync(logo) ? fs.statSync(logo).size : 0);

// Bed photos
const photos = ['0x1d4ed8', '0x0f766e', '0x7c2d12'].map((c, i) => {
  const out = path.join(scratch, `p${i}.jpg`);
  spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', `color=c=${c}:s=1600x900`, '-frames:v', '1', out], { encoding: 'utf8' });
  return out;
});

// ---------- INTRO: logo falls from heaven + spins 360 ----------
const introPath = path.join(scratch, 'intro.mp4');
const spin = '2*PI*t/2.6';
const introArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x0f172a:s=${W}x${H}:d=4:r=30`,
  '-loop', '1', '-t', '4', '-i', logo,
  '-filter_complex',
    [
      `[1:v]format=rgba,scale=420:420,rotate=${spin}:c=none:ow=rotw(${spin}):oh=roth(${spin})[spin]`,
      // Fall from far above, then a small settle overshoot.
      `[spin]overlay=x='(W-w)/2':y='if(lt(t,2.0), -640 + ((H-h)/2 + 640)*min(1,t/2.0)*1.06, if(lt(t,2.3), (H-h)/2 - 26*(2.3-t)/0.3, (H-h)/2))'[lg]`,
      `[0:v][lg]overlay=0:0:format=auto[v]`,
    ].join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30', introPath,
];
const introRun = spawnSync(ffmpeg, introArgs, { encoding: 'utf8' });
console.log('INTRO status:', introRun.status);
if (introRun.status !== 0) console.log('INTRO ERR:', introRun.stderr?.slice(-1000));
else console.log('INTRO size:', fs.statSync(introPath).size);

// ---------- OUTRO: logo settles in centre + phone number + website ----------
const outroPath = path.join(scratch, 'outro.mp4');
const outroArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x0f172a:s=${W}x${H}:d=5:r=30`,
  '-loop', '1', '-t', '5', '-i', logo,
  '-filter_complex',
    [
      `[1:v]format=rgba,scale=300:300[lg]`,
      `[lg]overlay=x='(W-w)/2':y='150 - 160*exp(-3*t)'[l2]`,
      // Fade the contact block up under the logo.
      `[l2]drawtext=text='Amana RentalHub NG':fontsize=64:fontcolor=white:x=(w-tw)/2:y=470:alpha='min(1,max(0,(t-0.9)/0.8))'[t1]`,
      `[t1]drawtext=text='rentalhub.com.ng   |   support@rentalhub.com.ng':fontsize=34:fontcolor=0xfacc15:x=(w-tw)/2:y=560:alpha='min(1,max(0,(t-1.5)/0.8))'[t2]`,
      `[t2]drawtext=text='Call or WhatsApp: +234 800 000 0000':fontsize=34:fontcolor=white:x=(w-tw)/2:y=620:alpha='min(1,max(0,(t-2.1)/0.8))'[v]`,
    ].join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30', outroPath,
];
const outroRun = spawnSync(ffmpeg, outroArgs, { encoding: 'utf8' });
console.log('OUTRO status:', outroRun.status);
if (outroRun.status !== 0) console.log('OUTRO ERR:', outroRun.stderr?.slice(-1000));
else console.log('OUTRO size:', fs.statSync(outroPath).size);

for (const [n, f] of [['INTRO', introPath], ['OUTRO', outroPath]]) {
  if (!fs.existsSync(f)) continue;
  const p = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' });
  console.log(`--- ${n} ---`);
  console.log((p.stderr || '').split('\n').filter((l) => /Duration|Stream/.test(l)).join('\n'));
}

fs.rmSync(scratch, { recursive: true, force: true });
