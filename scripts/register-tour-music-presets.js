/**
 * Register MP3 tracks from Video-Presets_290_Royalty_Free_Background_Music_Tracks/Mp3
 * into property_tour_music so they can be used by the property tour pipeline.
 *
 * Run against a real database (mock/in-memory DB will not persist):
 *   node scripts/register-tour-music-presets.js
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/middleware/database');

const PRESETS_DIR = path.join(process.cwd(), 'Video-Presets_290_Royalty_Free_Background_Music_Tracks', 'Mp3');

function walkMp3(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMp3(p, out);
    else if (/\.mp3$/i.test(entry.name)) out.push(p);
  }
  return out;
}

(async () => {
  if (!fs.existsSync(PRESETS_DIR)) {
    console.error('Presets directory not found:', PRESETS_DIR);
    process.exit(1);
  }

  const files = walkMp3(PRESETS_DIR);
  let inserted = 0;
  let skipped = 0;

  for (const full of files) {
    const rel = path.relative(process.cwd(), full).replace(/\\/g, '/');
    const title = path.basename(full, path.extname(full));
    const stat = fs.statSync(full);

    const exists = await db.query(
      'SELECT id FROM property_tour_music WHERE file_url = $1 OR title = $2 LIMIT 1',
      [rel, title]
    );
    if (exists.rows.length) {
      skipped += 1;
      continue;
    }

    await db.query(
      `INSERT INTO property_tour_music
       (title, file_url, file_type, file_size, is_active, auto_select, commercial_use_approved, priority)
       VALUES ($1,$2,$3,$4,TRUE,TRUE,TRUE,0)`,
      [title, rel, 'audio/mpeg', stat.size]
    );
    inserted += 1;
  }

  console.log(JSON.stringify({ inserted, skipped, total: files.length }, null, 2));
  process.exit(0);
})().catch((err) => {
  console.error('Failed to register tour music presets:', err.message);
  process.exit(1);
});
