const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Handle both old and new versions of multer-storage-cloudinary
const cloudinaryModule = require('multer-storage-cloudinary');
const CloudinaryStorage =
  cloudinaryModule.CloudinaryStorage || cloudinaryModule;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

module.exports = {
  uploadPassport,
  uploadPropertyMedia,
  cloudinary,
};
