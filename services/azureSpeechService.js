const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { getVoiceProfile } = require('../config/audioVoiceProfiles');
const { validateAudioFile } = require('./audioProcessingService');

const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function escapeSsml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function speechIdentity({ editionId = 'narration', text, profile = 'maleCorporate' }) {
  if (!/^[a-z0-9_-]{1,64}$/.test(editionId)) throw new Error('Invalid narration edition ID');
  if (typeof text !== 'string' || !text.trim()) throw new Error('Narration text is required');
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u.test(text)) throw new Error('Narration contains invalid XML characters');
  const voice = getVoiceProfile(profile);
  const identity = { provider: 'azure-speech', schema: 1, editionId, textHash: hash(text), voiceId: voice.voiceId, locale: voice.locale, outputFormat: OUTPUT_FORMAT, ssmlVersion: '1.0' };
  return { ...identity, hash: hash(JSON.stringify(identity)) };
}

function buildSsml(text, profile = 'maleCorporate') {
  speechIdentity({ text, profile });
  const voice = getVoiceProfile(profile);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${escapeSsml(voice.locale)}"><voice name="${escapeSsml(voice.voiceId)}">${escapeSsml(text.trim())}</voice></speak>`;
  if (Buffer.byteLength(ssml, 'utf8') > 60000) throw new Error('Narration is too long for one Azure request; split it into shorter passages');
  return ssml;
}

function readConfiguration(env) {
  const key = String(env.AZURE_SPEECH_KEY || '').trim();
  const region = String(env.AZURE_SPEECH_REGION || '').trim();
  if (!key || !region) throw new Error('Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION on the backend to generate Azure narration');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(region)) throw new Error('AZURE_SPEECH_REGION must be the Azure region code, not a URL or display name');
  return { key, region };
}

function speechError(message, retryable = false, retryAfterMs = null) {
  return Object.assign(new Error(message), { speechFailure: true, retryable, retryAfterMs });
}

async function readAudio(response) {
  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!['audio/mpeg', 'audio/mp3', 'application/octet-stream'].includes(type)) throw speechError('Azure returned a non-audio response');
  const advertised = Number(response.headers.get('content-length'));
  if (advertised > MAX_AUDIO_BYTES) throw speechError('Azure audio exceeds the supported size');
  if (!response.body) throw speechError('Azure returned no audio');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw speechError('Azure audio exceeds the supported size');
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size < 128) throw speechError('Azure returned empty or incomplete audio');
  return Buffer.concat(chunks, size);
}

function retryAfter(header) {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

function createAzureSpeechService({ fetchImpl = globalThis.fetch, validateAudio = validateAudioFile, env = process.env, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const inFlight = new Map();
  async function requestAudio({ text, profile, timeoutMs, maxRetries }) {
    const { key, region } = readConfiguration(env);
    const body = buildSsml(text, profile);
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let failure;
      try {
        const response = await fetchImpl(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST', redirect: 'error', signal: controller.signal,
          headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': OUTPUT_FORMAT, 'User-Agent': 'AmanaRentalHub-Narration' }, body,
        });
        if (!response.ok) {
          const delay = retryAfter(response.headers.get('retry-after'));
          await response.body?.cancel().catch(() => {});
          if ([401, 403].includes(response.status)) throw speechError(`Azure speech authentication failed (HTTP ${response.status}); check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION`);
          if (response.status === 429) throw speechError('Azure speech rate limit reached (HTTP 429); try later or check your quota', true, delay);
          throw speechError(`Azure speech request failed (HTTP ${response.status}); check service availability and the voice configuration`, [408, 500, 502, 503, 504].includes(response.status), delay);
        }
        return await readAudio(response);
      } catch (error) {
        failure = error.speechFailure ? error : speechError(controller.signal.aborted ? 'Azure speech request timed out' : 'Azure speech network request failed', true);
      } finally { clearTimeout(timer); }
      if (!failure.retryable || attempt >= maxRetries || failure.retryAfterMs > 10000) throw failure;
      await sleep(failure.retryAfterMs ?? Math.min(500 * (2 ** attempt), 4000));
    }
  }

  async function generateSpeech(options) {
    const { text, profile = 'maleCorporate', editionId = 'narration', cacheDir = path.join(os.tmpdir(), 'rentalhub-azure-speech'), force = false, timeoutMs = 30000, maxRetries = 2 } = options;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 3) throw new Error('Invalid Azure timeout or retry settings');
    const identity = speechIdentity({ text, profile, editionId });
    const directory = path.resolve(cacheDir), target = path.join(directory, `azure_${editionId}_${identity.hash}.mp3`);
    if (inFlight.has(target)) return inFlight.get(target);
    const pending = (async () => {
      if (!force) {
        try { await validateAudio(target, { timeoutMs: 120000 }); return target; } catch {}
      }
      readConfiguration(env);
      await fs.mkdir(directory, { recursive: true });
      const scratch = await fs.mkdtemp(path.join(directory, '.azure-'));
      const staged = path.join(scratch, 'speech.mp3');
      try {
        const audio = await requestAudio({ text, profile, timeoutMs, maxRetries });
        await fs.writeFile(staged, audio, { flag: 'wx', mode: 0o600 });
        await validateAudio(staged, { timeoutMs: 120000 });
        await fs.rename(staged, target);
        return target;
      } finally {
        if (path.dirname(scratch) !== directory || !path.basename(scratch).startsWith('.azure-')) throw new Error('Invalid Azure scratch path');
        await fs.rm(scratch, { recursive: true, force: true });
      }
    })();
    inFlight.set(target, pending);
    try { return await pending; } finally { if (inFlight.get(target) === pending) inFlight.delete(target); }
  }
  return { generateSpeech };
}

module.exports = { OUTPUT_FORMAT, speechIdentity, buildSsml, escapeSsml, readConfiguration, createAzureSpeechService, ...createAzureSpeechService() };
