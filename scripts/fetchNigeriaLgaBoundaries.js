#!/usr/bin/env node
// Fetches Nigeria LGA (admin level 2) boundary data and normalizes it into the
// compact file the survey gate loads at runtime (geo/nigeria_lgas.json).
//
// Default source: GADM 4.1 Nigeria level 2 (https://gadm.org). GADM is free for
// non-commercial use; if this product becomes commercial, swap SURVEY_BOUNDARY_SOURCE_URL
// for an equivalently licensed dataset — the downstream format is the same.
//
// Usage:  node scripts/fetchNigeriaLgaBoundaries.js
// Env:    SURVEY_BOUNDARY_SOURCE_URL (default GADM 4.1 zip)
//
// Output: geo/nigeria_lgas.json  (git-ignored — see .gitignore)

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'geo');
const OUT_FILE = path.join(OUT_DIR, 'nigeria_lgas.json');

const SOURCE_URL =
  process.env.SURVEY_BOUNDARY_SOURCE_URL ||
  'https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_NGA_2.json.zip';

const round = (value) => Math.round(value * 1e5) / 1e5;

const download = (url, dest) =>
  new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error('Download failed with HTTP ' + res.statusCode));
          res.resume();
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });

const extract = (zipPath, dir) => {
  // Prefer unzip, fall back to python3's zipfile module.
  try {
    execFileSync('unzip', ['-o', zipPath, '-d', dir], { stdio: 'ignore' });
    return;
  } catch {
    /* fall through */
  }
  try {
    execFileSync('python3', ['-m', 'zipfile', '-e', zipPath, dir], { stdio: 'ignore' });
    return;
  } catch (err) {
    throw new Error('Cannot extract zip: install unzip or python3 (' + err.message + ')');
  }
};

const findJson = (dir) => {
  const entry = fs.readdirSync(dir).find((f) => f.endsWith('.json'));
  if (!entry) throw new Error('No .json file inside the downloaded archive');
  return path.join(dir, entry);
};

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rh-lgas-'));
  const zipPath = path.join(tmpDir, 'lga.zip');

  console.log('Downloading ' + SOURCE_URL);
  await download(SOURCE_URL, zipPath);
  console.log('Extracting...');
  extract(zipPath, tmpDir);

  const raw = JSON.parse(fs.readFileSync(findJson(tmpDir), 'utf8'));
  if (!Array.isArray(raw.features)) throw new Error('Unexpected source format: no FeatureCollection');

  const seen = new Set();
  const features = [];
  let skipped = 0;
  for (const f of raw.features) {
    const props = f.properties || {};
    if (String(props.TYPE_2 || '').toLowerCase() === 'waterbody') {
      skipped += 1;
      continue;
    }
    const state = String(props.NAME_1 || '').trim();
    const lga = String(props.NAME_2 || '').trim();
    if (!state || !lga) {
      skipped += 1;
      continue;
    }
    const key = state + '|' + lga;
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const geom = f.geometry || {};
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    const rings = [];
    for (const poly of polys) {
      for (const ring of poly) {
        rings.push(ring.map(([x, y]) => [round(x), round(y)]));
      }
    }
    if (!rings.length) {
      skipped += 1;
      continue;
    }
    features.push({ s: state, lga, c: rings });
  }

  const data = { count: features.length, skipped, source: SOURCE_URL, features };
  fs.writeFileSync(OUT_FILE, JSON.stringify(data));
  console.log('Wrote ' + OUT_FILE + ' with ' + features.length + ' LGAs (skipped ' + skipped + ')');
  fs.rmSync(tmpDir, { recursive: true, force: true });
};

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
