const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { computeNarrationHash } = require('./propertyTourNarration');

/**
 * Provider-agnostic TTS service. No provider hard-coded.
 * If no provider configured, voice-over is skipped gracefully.
 */

const PROVIDER = String(process.env.PROPERTY_TOUR_VOICE_PROVIDER || '').toLowerCase();
const VOICE_ENABLED = String(process.env.PROPERTY_TOUR_VOICE_ENABLED || 'false').toLowerCase() === 'true';
const VOICE_ID = process.env.PROPERTY_TOUR_VOICE_ID || '';
const VOICE_LANGUAGE = process.env.PROPERTY_TOUR_VOICE_LANGUAGE || 'en-NG';

const getVoiceCacheDir = () => {
  const dir = path.join(require('os').tmpdir(), 'property-tour-voice-cache');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const getCachedAudio = (hash) => {
  try {
    const file = path.join(getVoiceCacheDir(), `${hash}.mp3`);
    if (fs.existsSync(file)) return file;
  } catch {}
  return null;
};

const saveToCache = (hash, sourcePath) => {
  try {
    const file = path.join(getVoiceCacheDir(), `${hash}.mp3`);
    if (fs.existsSync(sourcePath) && !fs.existsSync(file)) {
      fs.copyFileSync(sourcePath, file);
    }
    return file;
  } catch {}
  return sourcePath;
};

const synthesizeSpeech = async ({ text, voice, language, outputPath, logger: reqLogger = logger }) => {
  if (!VOICE_ENABLED || !text) return null;
  if (!PROVIDER) {
    reqLogger.warn?.('Property tour voice: no PROVIDER configured, skipping voice-over');
    return null;
  }

  // Abstraction only - provider implementations added when credentials exist
  try {
    // Placeholder: if provider modules exist, use them; otherwise skip gracefully
    reqLogger.info?.(`Property tour voice: provider=${PROVIDER} requested (abstraction ready)`);
    return null;
  } catch (error) {
    reqLogger.warn?.(`Property tour voice synthesis failed: ${error.message}`);
    return null;
  }
};

module.exports = {
  VOICE_ENABLED,
  PROVIDER,
  VOICE_ID,
  VOICE_LANGUAGE,
  synthesizeSpeech,
  getVoiceCacheDir,
  getCachedAudio,
  saveToCache,
  computeNarrationHash,
};
