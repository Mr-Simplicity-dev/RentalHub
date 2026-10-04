// Consolidated campaign flyer generator.
//
// One source of truth for the Amana-branded social flyers. It reuses the ten
// concept designs in generate.js (each already renders the "Amana" house mark
// above "RentalHub NG") and maps them to their marketing campaign names.
//
//   node generate-flyers.js            -> flyers/svg/*.svg
//   powershell -File render-flyers.ps1 -> flyers/png/*.png
//
// The flyers are square (1080x1080) by design. render-flyers.ps1 renders each
// at 1x, 2x and 4x plus the story/portrait variants by cropping the square.
const fs = require('fs');
const path = require('path');
const { DEF, t1, t2, t3, t4, t5, t6, t7, t8, t9, t10 } = require('./generate');

const CAMPAIGNS = [
  { name: 'luxury', fn: t1 },
  { name: 'savemonthly', fn: t2 },
  { name: 'smartsearch', fn: t3 },
  { name: 'legal', fn: t4 },
  { name: 'landlord', fn: t5 },
  { name: 'agents', fn: t6 },
  { name: 'diaspora', fn: t7 },
  { name: 'movein', fn: t8 },
  { name: 'rail', fn: t9 },
  { name: 'stories', fn: t10 },
];

const OUT = path.join(__dirname, 'flyers', 'svg');
fs.mkdirSync(OUT, { recursive: true });

const wrap = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080" preserveAspectRatio="xMidYMid slice">${DEF}${body}</svg>`;

for (const { name, fn } of CAMPAIGNS) {
  fs.writeFileSync(path.join(OUT, `${name}.svg`), wrap(fn()));
}

fs.writeFileSync(
  path.join(__dirname, 'flyers', 'manifest.json'),
  JSON.stringify({ campaigns: CAMPAIGNS.map((c) => c.name) }, null, 2)
);

console.log('campaigns:', CAMPAIGNS.length);
