const path = require('path');
const crypto = require('crypto');
const { getEditionVoiceProfile } = require('../config/audioVoiceProfiles');
const { speechIdentity, generateSpeech } = require('./azureSpeechService');
const { processAudio, validateAudioFile, buildAudioFilters } = require('./audioProcessingService');

function commercialAudioIdentity({ editionId, text, profile = getEditionVoiceProfile(editionId) }) {
  const generation = speechIdentity({ editionId, text, profile });
  const processing = { schema: 1, preset: 'corporateVoice', filters: buildAudioFilters('corporateVoice'), sampleRate: 48000, channels: 1, codec: 'libmp3lame', bitrate: '128k' };
  const hash = crypto.createHash('sha256').update(JSON.stringify({ generation, processing })).digest('hex');
  return { hash, generation, processing };
}

function createCommercialNarrationService({ generate = generateSpeech, process = processAudio, validate = validateAudioFile } = {}) {
  async function getCommercialNarration({ editionId, text, cacheDir, force = false }) {
    const profile = getEditionVoiceProfile(editionId);
    const identity = commercialAudioIdentity({ editionId, text, profile });
    const directory = path.resolve(cacheDir);
    const target = path.join(directory, `azure_vo_${editionId}_${identity.hash}_master.mp3`);
    if (!force) {
      try { await validate(target); return { file: target, cached: true, profile }; } catch {}
    }
    const raw = await generate({ editionId, text, profile, cacheDir: path.join(directory, 'azure-raw'), force });
    await process({ inputFile: raw, outputFile: target, preset: 'corporateVoice' });
    await validate(target);
    return { file: target, cached: false, profile };
  }
  return { getCommercialNarration };
}

module.exports = { commercialAudioIdentity, createCommercialNarrationService, ...createCommercialNarrationService() };
