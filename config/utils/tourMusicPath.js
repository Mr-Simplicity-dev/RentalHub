const fs = require('fs');
const path = require('path');

const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
};

const resolveLocalTourMusic = (value, projectRoot) => {
  if (typeof value !== 'string' || !value || /^https?:/i.test(value) || value.includes('\0')) return null;
  const roots = [
    path.join(projectRoot, 'Video-Presets_290_Royalty_Free_Background_Music_Tracks', 'Mp3'),
    path.join(projectRoot, 'uploads', 'property_tour', 'music'),
  ];
  try {
    const file = fs.realpathSync(path.resolve(projectRoot, value));
    if (!/\.(mp3|wav|aac|m4a)$/i.test(file) || !fs.statSync(file).isFile()) return null;
    return roots.some(root => {
      try { return inside(fs.realpathSync(root), file); } catch { return false; }
    }) ? file : null;
  } catch { return null; }
};

module.exports = { resolveLocalTourMusic };
