const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const db = require('../middleware/database');
const logger = require('./logger');
const {
  createTourVideo,
  isFfmpegAvailable,
  makeScratchDir,
  cleanupScratchDir,
  GUIDED_SHOTS,
  BRAND_PHONE,
  buildFactsLine,
} = require('./propertyTourVideo');

/**
 * Builds the automatic tour video for a property.
 *
 * Photos live on Cloudinary, so this downloads them, encodes a Ken Burns tour
 * and uploads the result back to Cloudinary as a property video - the same
 * place a manually uploaded video would go. Nothing is stored locally beyond a
 * temporary scratch directory that is always removed.
 *
 * Every failure path returns quietly. A listing must never be held back or
 * broken because its video could not be made.
 */

const MIN_PHOTOS = 2;
const DOWNLOAD_TIMEOUT_MS = 20000;

/**
 * The number shown on the video. Each state can have its own line, so this
 * prefers a per-state entry and falls back to the platform-wide number.
 * Configure with PROPERTY_TOUR_PHONE_STATES as JSON, e.g.
 *   {"Lagos":"0803...","Federal Capital Territory":"0906..."}
 */
const resolvePhoneForState = (stateName) => {
  if (!stateName) return BRAND_PHONE;

  try {
    const map = JSON.parse(process.env.PROPERTY_TOUR_PHONE_STATES || '{}');
    const key = String(stateName).trim();
    if (map && typeof map === 'object' && map[key]) return String(map[key]);
  } catch (error) {
    logger.warn(`PROPERTY_TOUR_PHONE_STATES is not valid JSON: ${error.message}`);
  }

  return BRAND_PHONE;
};

let cloudinaryConfigured = false;

const ensureCloudinary = () => {
  if (cloudinaryConfigured) return true;

  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;

  if (!cloud_name || !api_key || !api_secret) return false;

  cloudinary.config({ cloud_name, api_key, api_secret });
  cloudinaryConfigured = true;
  return true;
};

const extensionFor = (url, fallback = '.jpg') => {
  const match = String(url || '').split('?')[0].match(/\.(jpe?g|png|webp|gif)$/i);
  return match ? `.${match[1].toLowerCase()}` : fallback;
};

const videoExtensionFor = (url) => {
  const match = String(url || '').split('?')[0].match(/\.(mp4|mov|m4v|webm|avi|mkv)$/i);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
};

const downloadMedia = async (url, destinationPath, index) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 120 * 1024 * 1024,
  });

  fs.writeFileSync(destinationPath, Buffer.from(response.data));
  return destinationPath;
};

const downloadPhoto = async (url, destinationBase, index) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: 25 * 1024 * 1024,
  });

  const filePath = `${destinationBase}_${index}${extensionFor(url)}`;
  fs.writeFileSync(filePath, Buffer.from(response.data));
  return filePath;
};

const fetchPropertyPhotos = async (propertyId) => {
  const result = await db.query(
    `SELECT photo_url
     FROM property_photos
     WHERE property_id = $1
     ORDER BY is_primary DESC, upload_order ASC, id ASC
     LIMIT 12`,
    [propertyId]
  );

  return result.rows.map((row) => row.photo_url).filter(Boolean);
};

const fetchPropertyClips = async (propertyId) => {
  try {
    const result = await db.query(
      `SELECT clip_url
       FROM property_clips
       WHERE property_id = $1
       ORDER BY clip_order ASC, id ASC
       LIMIT 4`,
      [propertyId]
    );

    return result.rows.map((row) => row.clip_url).filter(Boolean);
  } catch (error) {
    // The table may not exist yet on a server that has not migrated. A tour
    // without clips is still a good tour, so this never fails the job.
    logger.warn(`Property clips unavailable for #${propertyId}: ${error.message}`);
    return [];
  }
};

const uploadTourToCloudinary = async (filePath) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      filePath,
      {
        resource_type: 'video',
        folder: 'rental_platform/properties/videos',
        public_id: `property_tour_${Date.now()}`,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
  });

/**
 * Generate and attach a tour video for one property.
 * Returns true only when a video was produced and saved.
 */
const generatePropertyTour = async ({ propertyId, force = false, logger: reqLogger = logger } = {}) => {
  const id = Number(propertyId);
  if (!Number.isInteger(id) || id <= 0) return false;

  try {
    if (!isFfmpegAvailable()) {
      reqLogger.warn?.('Property tour skipped: ffmpeg is not available on this server');
      return false;
    }

    if (!ensureCloudinary()) {
      reqLogger.warn?.('Property tour skipped: Cloudinary is not configured');
      return false;
    }

    const existing = await db.query(
      `SELECT id, title, video_url, city, area, state,
              property_type, bedrooms, bathrooms, rent_amount, payment_frequency
       FROM properties WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!existing.rows.length) return false;

    // Never overwrite a real video the landlord shot and uploaded himself.
    if (!force && existing.rows[0].video_url) return false;

    const photoUrls = await fetchPropertyPhotos(id);
    const clipUrls = await fetchPropertyClips(id);

    if (photoUrls.length < MIN_PHOTOS && !clipUrls.length) {
      reqLogger.warn?.(`Property tour skipped for #${id}: needs at least ${MIN_PHOTOS} photos`);
      return false;
    }

    const scratch = makeScratchDir();
    try {
      const downloaded = [];
      for (let index = 0; index < photoUrls.length; index += 1) {
        try {
          downloaded.push(await downloadPhoto(photoUrls[index], path.join(scratch, 'shot'), index));
        } catch (downloadError) {
          reqLogger.warn?.(`Property tour: skipping unreadable photo ${index + 1}: ${downloadError.message}`);
        }
      }

      const downloadedClips = [];
      for (let index = 0; index < clipUrls.length; index += 1) {
        try {
          downloadedClips.push(
            await downloadMedia(
              clipUrls[index],
              path.join(scratch, `clip_${index}${videoExtensionFor(clipUrls[index])}`),
              index
            )
          );
        } catch (clipError) {
          reqLogger.warn?.(`Property tour: skipping unreadable clip ${index + 1}: ${clipError.message}`);
        }
      }

      // A single still is not a tour, but a clip is motion: a property with one
      // photo and one clip still has a story worth telling.
      if (downloaded.length < MIN_PHOTOS && !downloadedClips.length) {
        reqLogger.warn?.(`Property tour skipped for #${id}: too few photos downloaded`);
        return false;
      }

      const labels = GUIDED_SHOTS.slice(0, downloaded.length).map((shot) => shot.label);
      const outputPath = path.join(scratch, `tour_${id}.mp4`);

      const property = existing.rows[0];
      const location = [property.area, property.city, property.state].filter(Boolean).join(', ');
      const facts = buildFactsLine({
        rentAmount: property.rent_amount,
        paymentFrequency: property.payment_frequency,
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        propertyType: property.property_type,
      });

      const produced = await createTourVideo({
        photoPaths: downloaded,
        outputPath,
        labels,
        title: property.title || '',
        location,
        phone: resolvePhoneForState(property.state),
        facts,
        propertyType: property.property_type || '',
        clipPaths: downloadedClips,
        logger: reqLogger,
      });

      if (!produced) return false;

      const uploaded = await uploadTourToCloudinary(produced);
      const videoUrl = uploaded?.secure_url || uploaded?.url;
      if (!videoUrl) return false;

      await db.query(
        `UPDATE properties
         SET video_url = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [videoUrl, id]
      );

      reqLogger.info?.(`Property tour video generated for #${id}`);
      return true;
    } finally {
      cleanupScratchDir(scratch);
    }
  } catch (error) {
    reqLogger.error?.('Property tour generation error:', error);
    return false;
  }
};

module.exports = {
  generatePropertyTour,
  fetchPropertyPhotos,
  fetchPropertyClips,
  ensureCloudinary,
  resolvePhoneForState,
  MIN_PHOTOS,
};
