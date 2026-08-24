const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const MAGIC_BYTE_CHECKS = {
  jpeg: { offset: 0, bytes: [0xFF, 0xD8, 0xFF] },
  png: { offset: 0, bytes: [0x89, 0x50, 0x4E, 0x47] },
  gif: { offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  webp: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  mp4: { offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  webm: { offset: 0, bytes: [0x1A, 0x45, 0xDF, 0xA3] },
};

const validateFileMagicBytes = (filePath) => {
  if (!filePath) return false;
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    const bytesRead = fs.readSync(fd, header, 0, 16, 0);
    if (bytesRead < 4) return false;
    for (const [, spec] of Object.entries(MAGIC_BYTE_CHECKS)) {
      if (bytesRead < spec.offset + spec.bytes.length) continue;
      if (spec.bytes.every((b, i) => header[spec.offset + i] === b)) return true;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
};

// Handle both old and new versions of multer-storage-cloudinary
const cloudinaryModule = require('multer-storage-cloudinary');
const CloudinaryStorage =
  cloudinaryModule.CloudinaryStorage || cloudinaryModule;

/**
 * Lazy-init: configure Cloudinary on first upload request
 * instead of at module load time.
 */
let cloudinaryConfigured = false;
const ensureCloudinaryConfig = () => {
  if (cloudinaryConfigured) return;
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) {
    throw new Error(
      'Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  cloudinary.config({ cloud_name, api_key, api_secret });
  cloudinaryConfigured = true;
};

// Wrap multer middleware to ensure Cloudinary config before processing
const withCloudinaryConfig = (uploadMiddleware) => {
  return (req, res, next) => {
    try {
      ensureCloudinaryConfig();
      uploadMiddleware(req, res, next);
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  };
};

// ---------------- PASSPORT STORAGE ----------------

const passportStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rental_platform/passports',
    format: async () => 'png',
    public_id: () => `passport_${Date.now()}`,
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  },
});

// ---------------- PROPERTY MEDIA STORAGE ----------------
// Handles BOTH images and video dynamically

const propertyMediaStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = file.mimetype.startsWith('video/');

    return {
      folder: isVideo
        ? 'rental_platform/properties/videos'
        : 'rental_platform/properties/images',
      resource_type: isVideo ? 'video' : 'image',
      public_id: `${isVideo ? 'property_vid' : 'property_img'}_${Date.now()}`,
      transformation: isVideo
        ? undefined
        : [{ width: 1200, height: 800, crop: 'limit' }],
    };
  },
});

// ---------------- FILTER ----------------

const mediaFilter = (req, file, cb) => {
  if (
    (file.mimetype && file.mimetype.startsWith('image/')) ||
    (file.mimetype && file.mimetype.startsWith('video/'))
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only image or video files are allowed!'), false);
  }
};

// ---------------- UPLOADERS ----------------

const uploadPassport = multer({
  storage: passportStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('passport');

const uploadPassportWithValidation = (req, res, next) => {
  uploadPassport(req, res, (err) => {
    if (err) return next(err);
    if (req.file && !validateFileMagicBytes(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      return res.status(400).json({
        success: false,
        message: 'File content does not match allowed file types. The file may be corrupted or renamed.',
      });
    }
    next();
  });
};

// Handles: images[] (up to 20) + video (1)
const uploadPropertyMedia = multer({
  storage: propertyMediaStorage,
  fileFilter: mediaFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
}).fields([
  { name: 'images', maxCount: 20 },
  { name: 'video', maxCount: 1 },
]);

const uploadPropertyPhotos = multer({
  storage: propertyMediaStorage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 },
}).array('photos', 20);

// ---------------- LOCAL PASSPORT STORAGE (primary) ----------------

const passportUploadDir = path.join(__dirname, '..', '..', 'uploads', 'passports');
if (!fs.existsSync(passportUploadDir)) {
  fs.mkdirSync(passportUploadDir, { recursive: true });
}

const ALLOWED_PASSPORT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

const passportDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, passportUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_PASSPORT_EXTENSIONS.has(ext)) {
      return cb(new Error(`Invalid file extension "${ext}". Allowed: ${Array.from(ALLOWED_PASSPORT_EXTENSIONS).join(', ')}`));
    }
    cb(null, `passport_${req.user ? req.user.id : 'anon'}_${Date.now()}${ext}`);
  }
});

const uploadPassportLocal = multer({
  storage: passportDiskStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_PASSPORT_EXTENSIONS.has(ext)) {
      return cb(new Error('Invalid image file type'));
    }
    cb(null, true);
  }
}).single('passport');

const validateFileMagicBytesMiddleware = (req, res, next) => {
  if (!req.file) return next();
  if (!validateFileMagicBytes(req.file.path)) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({
      success: false,
      message: 'File content does not match allowed file types. The file may be corrupted or renamed.',
    });
  }
  next();
};

module.exports = {
  uploadPassport: withCloudinaryConfig(uploadPassportWithValidation),
  uploadPassportLocal,
  uploadPropertyMedia: withCloudinaryConfig(uploadPropertyMedia),
  uploadPropertyPhotos: withCloudinaryConfig(uploadPropertyPhotos),
  validateFileMagicBytesMiddleware,
  cloudinary,
};

