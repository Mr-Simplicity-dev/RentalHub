const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveFfmpegPath } = require('./config/utils/propertyTourVideo');

const ffmpeg = resolveFfmpegPath();
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tour-fix-'));
const W = 1280, H = 720;

const logo = path.join(scratch, 'logo.png');
spawnSync(ffmpeg, [
  '-y', '-f', 'lavfi', '-i', 'color=c=0x2563eb:s=512x512:d=1',
  '-vf', `format=rgba,geq=r=37:g=99:b=235:a='255*lt(hypot(X-256,Y-256),240)'`,
  '-frames:v', '1', logo,
], { encoding: 'utf8' });

const t0 = Date.now();
const introPath = path.join(scratch, 'intro.mp4');
// Constant output size: scale to 300, pad to the diagonal (300*sqrt2~424) so any
// angle fits, keeping the canvas square and stable across the whole rotation.
const introArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x0f172a:s=${W}x${H}:d=4:r=30`,
  '-loop', '1', '-t', '4', '-i', logo,
  '-filter_complex',
    [
      `[1:v]format=rgba,scale=300:300,pad=440:440:(ow-iw)/2:(oh-ih)/2:color=0x00000000,` +
      `rotate=2*PI*t/2.6:c=none:ow=440:oh=440[spin]`,
      `[0:v][spin]overlay=x='(W-w)/2':y='if(lt(t,2.0), -640 + ((H-h)/2 + 640)*min(1,t/2.0)*1.06, if(lt(t,2.3), (H-h)/2 - 26*(2.3-t)/0.3, (H-h)/2))':format=auto[v]`,
    ].join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30', introPath,
];
const r1 = spawnSync(ffmpeg, introArgs, { encoding: 'utf8' });
console.log('INTRO status:', r1.status, '| ms:', Date.now() - t0);
if (r1.status !== 0) console.log('INTRO ERR:', r1.stderr?.slice(-900));
else console.log('INTRO size:', fs.statSync(introPath).size);

// Fixed outro: the logo is COMPOSITED ONTO the colour background first.
const outroPath = path.join(scratch, 'outro.mp4');
const outroArgs = [
  '-y',
  '-f', 'lavfi', '-i', `color=c=0x0f172a:s=${W}x${H}:d=5:r=30`,
  '-loop', '1', '-t', '5', '-i', logo,
  '-filter_complex',
    [
      `[1:v]format=rgba,scale=300:300[lg]`,
      `[0:v][lg]overlay=x='(W-w)/2':y='130 - 150*exp(-3*t)':format=auto[b1]`,
      `[b1]drawtext=text='Amana RentalHub NG':fontsize=62:fontcolor=white:x=(w-tw)/2:y=460:alpha='min(1,max(0,(t-0.9)/0.8))'[b2]`,
      `[b2]drawtext=text='rentalhub.com.ng   |   support@rentalhub.com.ng':fontsize=34:fontcolor=0xfacc15:x=(w-tw)/2:y=550:alpha='min(1,max(0,(t-1.5)/0.8))'[b3]`,
      `[b3]drawtext=text='Call or WhatsApp: +234 800 000 0000':fontsize=34:fontcolor=white:x=(w-tw)/2:y=610:alpha='min(1,max(0,(t-2.1)/0.8))'[v]`,
    ].join(';'),
  '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-r', '30', outroPath,
];
const r2 = spawnSync(ffmpeg, outroArgs, { encoding: 'utf8' });
console.log('OUTRO status:', r2.status);
if (r2.status !== 0) console.log('OUTRO ERR:', r2.stderr?.slice(-900));
else console.log('OUTRO size:', fs.statSync(outroPath).size);

for (const [n, f, want] of [['INTRO', introPath, '1280x720'], ['OUTRO', outroPath, '1280x720']]) {
  if (!fs.existsSync(f)) continue;
  const p = spawnSync(ffmpeg, ['-i', f], { encoding: 'utf8' });
  const info = (p.stderr || '').split('\n').filter((l) => /Duration|Stream/.test(l));
  console.log(`--- ${n} (want ${want}) ---`);
  console.log(info.join('\n'));
}

fs.rmSync(scratch, { recursive: true, force: true });
