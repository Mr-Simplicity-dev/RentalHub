const VOICE_PROFILES = Object.freeze({
  maleCorporate: Object.freeze({ voiceId: 'en-NG-AbeoNeural', locale: 'en-NG' }),
  femaleCorporate: Object.freeze({ voiceId: 'en-NG-EzinneNeural', locale: 'en-NG' }),
});

const EDITION_VOICE_PROFILES = Object.freeze({
  flagship: 'maleCorporate',
  landlord: 'maleCorporate',
  tenant: 'femaleCorporate',
  protection: 'femaleCorporate',
});

function getVoiceProfile(name) {
  if (!Object.hasOwn(VOICE_PROFILES, name)) throw new Error('Unknown speech voice profile');
  return VOICE_PROFILES[name];
}

function getEditionVoiceProfile(editionId) {
  if (!Object.hasOwn(EDITION_VOICE_PROFILES, editionId)) throw new Error('Unknown commercial edition');
  return EDITION_VOICE_PROFILES[editionId];
}

module.exports = { VOICE_PROFILES, EDITION_VOICE_PROFILES, getVoiceProfile, getEditionVoiceProfile };
