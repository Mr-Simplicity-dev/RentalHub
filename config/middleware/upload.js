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

// Storage for passport photos
const passportStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rental_platform/passports',
    format: async () => 'png',
    public_id: () => `passport_${Date.now()}`,
    transformation: [{ width: 500, height: 500, crop: 'limit' }],
  },
});

// Storage for property photos
const propertyStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'rental_platform/properties',
    format: async () => 'jpg',
    public_id: () => `property_${Date.now()}`,
    transformation: [{ width: 1200, height: 800, crop: 'limit' }],
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype && file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const uploadPassport = multer({
  storage: passportStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('passport');

const uploadPropertyPhotos = multer({
  storage: propertyStorage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).array('photos', 20);

module.exports = {
  uploadPassport,
  uploadPropertyPhotos,
  cloudinary,
};
