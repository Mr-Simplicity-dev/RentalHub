const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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

module.exports = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter
});
