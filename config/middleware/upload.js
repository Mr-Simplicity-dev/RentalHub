const multer = require('multer');
const cloudinary = require('cloudinary').v2;

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

module.exports = {
  uploadPassport: withCloudinaryConfig(uploadPassport),
  uploadPropertyMedia: withCloudinaryConfig(uploadPropertyMedia),
  uploadPropertyPhotos: withCloudinaryConfig(uploadPropertyPhotos),
  cloudinary,
};

