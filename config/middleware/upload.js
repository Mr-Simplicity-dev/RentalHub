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

// ---------------- PROPERTY IMAGE STORAGE ----------------

const propertyImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rental_platform/properties/images',
    format: async () => 'jpg',
    public_id: () => `property_img_${Date.now()}`,
    transformation: [{ width: 1200, height: 800, crop: 'limit' }],
  },
});

// ---------------- PROPERTY VIDEO STORAGE ----------------

const propertyVideoStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rental_platform/properties/videos',
    resource_type: 'video',
    public_id: () => `property_vid_${Date.now()}`,
  },
});

// ---------------- FILTERS ----------------

const imageFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const videoFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Only video files are allowed!'), false);
  }
};

// ---------------- UPLOADERS ----------------

const uploadPassport = multer({
  storage: passportStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('passport');

// This handles BOTH images and one video
const uploadPropertyMedia = multer({
  storage: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, propertyImageStorage);
    } else if (file.mimetype.startsWith('video/')) {
      cb(null, propertyVideoStorage);
    } else {
      cb(new Error('Invalid file type'), null);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // up to 50MB for video
}).fields([
  { name: 'images', maxCount: 20 },
  { name: 'video', maxCount: 1 },
]);

module.exports = {
  uploadPassport,
  uploadPropertyMedia,
  cloudinary,
};
