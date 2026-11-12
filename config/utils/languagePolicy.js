const catalog = require('./nigerianLanguages.json');
const languages = catalog.languages;
const ids = new Set(languages.map(x => x.id));
const PIDGIN = languages.find(x => x.iso === 'pcm').id;
const LEVELS = ['basic', 'conversational', 'fluent'];
const requiresLanguages = role => role?.opportunity_type === 'volunteer' || /support/i.test(role?.title || '');
function validateSkills(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) throw new Error('Select 2 to 5 languages, including Nigerian Pidgin.');
  const seen = new Set();
  const rows = value.map(row => {
    if (!row || !ids.has(row.language_id) || seen.has(row.language_id)) throw new Error('Choose different languages from the list.');
    if (!LEVELS.includes(row.oral) || !['none', ...LEVELS].includes(row.written)) throw new Error('Choose speaking/understanding and reading/writing levels for every language.');
    seen.add(row.language_id);
    return {
      language_id: row.language_id,
      oral: row.oral,
      written: row.written
    };
  });
  if (!seen.has(PIDGIN)) throw new Error('Nigerian Pidgin is required.');
  return rows;
}
function languagePreference(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!ids.has(value)) throw new Error('Choose a support language from the list.');
  return value;
}
module.exports = {
  languages,
  PIDGIN,
  LEVELS,
  requiresLanguages,
  validateSkills,
  languagePreference
};
