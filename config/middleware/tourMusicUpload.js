const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const extensions = new Set(['.mp3', '.wav', '.aac', '.m4a']);
const mimeTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mp4', 'audio/m4a', 'audio/x-m4a']);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => {
      const directory = path.join(__dirname, '../../uploads/property_tour/music');
      fs.mkdir(directory, { recursive: true }, error => done(error, directory));
    },
    filename: (_req, file, done) => done(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 30 },
  fileFilter: (_req, file, done) => {
    if (extensions.has(path.extname(file.originalname).toLowerCase()) && mimeTypes.has(file.mimetype)) return done(null, true);
    const error = new Error('Use an MP3, WAV, AAC, or M4A audio file.');
    error.status = 400;
    done(error);
  },
}).single('music');

const isAudioHeader = header =>
  header.subarray(0, 3).toString() === 'ID3' ||
  (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) ||
  (header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WAVE') ||
  header.subarray(4, 8).toString() === 'ftyp';

module.exports = (req, res, next) => upload(req, res, error => {
  if (error) return res.status(400).json({ success: false, message: error.code === 'LIMIT_FILE_SIZE' ? 'Music files must be 25 MB or smaller.' : error.message });
  if (!req.file) return next();
  let descriptor;
  try {
    descriptor = fs.openSync(req.file.path, 'r');
    const header = Buffer.alloc(16);
    const bytes = fs.readSync(descriptor, header, 0, header.length, 0);
    if (bytes >= 12 && isAudioHeader(header)) return next();
  } catch (readError) {
    req.logger?.warn?.('Could not validate tour music upload');
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  fs.unlink(req.file.path, () => {});
  return res.status(400).json({ success: false, message: 'File content must be supported audio.' });
});
