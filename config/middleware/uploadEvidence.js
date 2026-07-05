const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const MAGIC_BYTE_CHECKS = {
  jpeg: { offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  png: { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  pdf: { offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
};

const EVIDENCE_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'disputes');

if (!fs.existsSync(EVIDENCE_UPLOAD_DIR)) {
  fs.mkdirSync(EVIDENCE_UPLOAD_DIR, { recursive: true });
}

const MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/pdf': '.pdf',
};

const MIME_ALLOWED_EXTENSIONS = {
  'image/jpeg': new Set(['.jpg', '.jpeg']),
  'image/png': new Set(['.png']),
  'application/pdf': new Set(['.pdf']),
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, EVIDENCE_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const originalExt = path.extname(file.originalname || '').toLowerCase();
    const ext = MIME_EXTENSIONS[file.mimetype] || originalExt || '.bin';
    cb(null, `evidence_${Date.now()}_${crypto.randomBytes(16).toString('hex')}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const originalExt = path.extname(file.originalname || '').toLowerCase();
  const expectedExt = MIME_EXTENSIONS[file.mimetype];

  if (!expectedExt) {
    return cb(new Error('Only JPG, PNG, PDF allowed'), false);
  }

  if (originalExt && !MIME_ALLOWED_EXTENSIONS[file.mimetype]?.has(originalExt)) {
    return cb(new Error('File extension does not match the uploaded file type'), false);
  }

  cb(null, true);
};

const validateEvidenceMagicBytes = (req, res, next) => {
  const files = req.file ? [req.file] : (req.files || []);
  for (const file of files) {
    if (!file || !file.path) continue;
    const fd = fs.openSync(file.path, 'r');
    try {
      const header = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, header, 0, 16, 0);
      if (bytesRead < 4) {
        fs.unlinkSync(file.path);
        return res.status(400).json({ success: false, message: 'File is too small or empty.' });
      }
      const valid = Object.values(MAGIC_BYTE_CHECKS).some(spec =>
        bytesRead >= spec.offset + spec.bytes.length &&
        spec.bytes.every((b, i) => header[spec.offset + i] === b)
      );
      if (!valid) {
        try { fs.unlinkSync(file.path); } catch (_) {}
        return res.status(400).json({
          success: false,
          message: 'File content does not match allowed file types.',
        });
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  next();
};

const uploadEvidenceMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter
});

module.exports = uploadEvidenceMiddleware;
module.exports.validateEvidenceMagicBytes = validateEvidenceMagicBytes;
