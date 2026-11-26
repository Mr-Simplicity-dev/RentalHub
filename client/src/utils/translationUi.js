const SUPPORTED_TRANSLATION_LANGUAGES = ['en', 'ru', 'fr', 'ar', 'zh', 'ha', 'ig', 'yo'];

export const translationTargetLanguage = (language) => {
  const normalized = String(language || 'en').toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_TRANSLATION_LANGUAGES.includes(normalized) ? normalized : 'en';
};

export const canTranslateMessageRecord = (message) => (
  String(message?.message_type || 'general') === 'general'
  && !message?.attachment_url
  && !message?.file_url
  && !message?.media_url
  && !message?.audio_url
  && !message?.document_url
  && !message?.voice_note
);
