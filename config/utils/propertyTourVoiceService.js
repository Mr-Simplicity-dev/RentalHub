const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const logger = require('./logger');
const { computeNarrationHash } = require('./propertyTourNarration');

/**
 * Provider-agnostic TTS service. No provider is hard-coded into the tour
 * pipeline; a deployment either configures one of the adapters below or the
 * voice-over is skipped and the tour ships silently.
 *
 * Supported PROPERTY_TOUR_VOICE_PROVIDER values:
 *   openai      OPENAI_API_KEY (+ optional PROPERTY_TOUR_VOICE_MODEL)
 *   elevenlabs  ELEVENLABS_API_KEY + PROPERTY_TOUR_VOICE_ID
 *   custom      PROPERTY_TOUR_VOICE_ENDPOINT (+ optional PROPERTY_TOUR_VOICE_API_KEY)
 */

const PROVIDER = String(process.env.PROPERTY_TOUR_VOICE_PROVIDER || '').toLowerCase();
const VOICE_ENABLED = String(process.env.PROPERTY_TOUR_VOICE_ENABLED || 'false').toLowerCase() === 'true';
const VOICE_ID = process.env.PROPERTY_TOUR_VOICE_ID || '';
const VOICE_LANGUAGE = process.env.PROPERTY_TOUR_VOICE_LANGUAGE || 'en-NG';
const VOICE_MODEL = process.env.PROPERTY_TOUR_VOICE_MODEL || '';
const REQUEST_TIMEOUT_MS = Number(process.env.PROPERTY_TOUR_VOICE_TIMEOUT_MS) || 45000;

const getVoiceCacheDir = () => {
  const dir = path.join(os.tmpdir(), 'property-tour-voice-cache');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const getCachedAudio = (hash) => {
  try {
    const file = path.join(getVoiceCacheDir(), `${hash}.mp3`);
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  } catch {}
  return null;
};

const saveToCache = (hash, sourcePath) => {
  try {
    const file = path.join(getVoiceCacheDir(), `${hash}.mp3`);
    if (fs.existsSync(sourcePath) && !fs.existsSync(file)) {
      fs.copyFileSync(sourcePath, file);
    }
    if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  } catch {}
  return sourcePath;
};

const writeAudio = (outputPath, data) => {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (!buffer.length) throw new Error('empty audio response');
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
};

const synthesizeOpenAi = async ({ text, outputPath }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await axios.post(
    'https://api.openai.com/v1/audio/speech',
    {
      model: VOICE_MODEL || 'gpt-4o-mini-tts',
      voice: VOICE_ID || 'alloy',
      input: text,
      response_format: 'mp3',
    },
    {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  return writeAudio(outputPath, response.data);
};

const synthesizeElevenLabs = async ({ text, outputPath }) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');
  if (!VOICE_ID) throw new Error('PROPERTY_TOUR_VOICE_ID is required for ElevenLabs');

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(VOICE_ID)}`,
    {
      text,
      model_id: VOICE_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75 },
    },
    {
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      responseType: 'arraybuffer',
      timeout: REQUEST_TIMEOUT_MS,
    }
  );

  return writeAudio(outputPath, response.data);
};

const synthesizeCustom = async ({ text, outputPath }) => {
  const endpoint = process.env.PROPERTY_TOUR_VOICE_ENDPOINT;
  if (!endpoint) throw new Error('PROPERTY_TOUR_VOICE_ENDPOINT is not configured');

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.PROPERTY_TOUR_VOICE_API_KEY) {
    headers.Authorization = `Bearer ${process.env.PROPERTY_TOUR_VOICE_API_KEY}`;
  }

  const response = await axios.post(
    endpoint,
    { text, voice: VOICE_ID || undefined, language: VOICE_LANGUAGE },
    { headers, responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT_MS }
  );

  return writeAudio(outputPath, response.data);
};

const ADAPTERS = {
  openai: synthesizeOpenAi,
  elevenlabs: synthesizeElevenLabs,
  custom: synthesizeCustom,
};

/**
 * Synthesises one line of narration. Returns the cached/live mp3 path, or null
 * when voice is disabled or the provider failed. Callers must treat null as
 * "no voice", never as an error.
 */
const synthesizeSpeech = async ({
  text,
  voice = VOICE_ID,
  language = VOICE_LANGUAGE,
  outputPath,
  logger: reqLogger = logger,
}) => {
  if (!VOICE_ENABLED || !text) return null;
  if (!PROVIDER) {
    reqLogger.warn?.('Property tour voice: no PROVIDER configured, skipping voice-over');
    return null;
  }

  const adapter = ADAPTERS[PROVIDER];
  if (!adapter) {
    reqLogger.warn?.(`Property tour voice: unsupported provider "${PROVIDER}", skipping voice-over`);
    return null;
  }

  const hash = computeNarrationHash(
    [{ text }],
    { provider: PROVIDER, model: VOICE_MODEL, voice, language }
  );
  const cached = getCachedAudio(hash);
  if (cached) {
    reqLogger.info?.(`Property tour voice: cache hit for ${hash.slice(0, 10)}`);
    return cached;
  }

  const target = outputPath || path.join(getVoiceCacheDir(), `${hash}.mp3`);

  try {
    await adapter({ text, voice, language, outputPath: target });
    const saved = saveToCache(hash, target);
    reqLogger.info?.(`Property tour voice: synthesised with ${PROVIDER}`);
    return saved;
  } catch (error) {
    reqLogger.warn?.(`Property tour voice synthesis failed (${PROVIDER}): ${error.message}`);
    return null;
  }
};

const isVoiceConfigured = () => VOICE_ENABLED && Boolean(PROVIDER) && Boolean(ADAPTERS[PROVIDER]);

module.exports = {
  VOICE_ENABLED,
  PROVIDER,
  VOICE_ID,
  VOICE_LANGUAGE,
  VOICE_MODEL,
  isVoiceConfigured,
  synthesizeSpeech,
  getVoiceCacheDir,
  getCachedAudio,
  saveToCache,
  computeNarrationHash,
};
