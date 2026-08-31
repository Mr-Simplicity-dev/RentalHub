/**
 * Survey index: merges tenant + landlord questionnaires, applies the
 * per-language translation files (ha/yo/ig), and exposes helpers used by
 * the wizard API and the analysis engine.
 */

const tenant = require('./tenantQuestionnaire');
const landlord = require('./landlordQuestionnaire');
const ha = require('./translations/ha');
const yo = require('./translations/yo');
const ig = require('./translations/ig');

const SURVEY_VERSION = 2;

const LANGUAGES = ['en', 'ha', 'yo', 'ig'];

const applyTranslations = (question) => {
  const prompt = { ...question.prompt };
  if (ha.prompts[question.key]) prompt.ha = ha.prompts[question.key];
  if (yo.prompts[question.key]) prompt.yo = yo.prompts[question.key];
  if (ig.prompts[question.key]) prompt.ig = ig.prompts[question.key];

  let options = question.options;
  if (options) {
    options = options.map((option) => ({
      ...option,
      ha: ha.options?.[question.key]?.[option.v] || option.ha,
      yo: yo.options?.[question.key]?.[option.v] || option.yo,
      ig: ig.options?.[question.key]?.[option.v] || option.ig,
    }));
  }

  // Likert scale labels (e.g. Strongly disagree … Strongly agree, and the
  // importance scale for feature questions).
  let labels = question.labels;
  if (labels) {
    labels = Object.fromEntries(
      Object.entries(labels).map(([value, labelObj]) => [
        value,
        {
          ...labelObj,
          ha: ha.labels?.[question.key]?.[value] || labelObj.ha,
          yo: yo.labels?.[question.key]?.[value] || labelObj.yo,
          ig: ig.labels?.[question.key]?.[value] || labelObj.ig,
        },
      ])
    );
  }

  return { ...question, prompt, options, labels };
};

const mergeQuestionnaire = (base) => ({
  ...base,
  questions: base.questions.map(applyTranslations),
});

const QUESTIONNAIRES = {
  tenant: mergeQuestionnaire(tenant),
  landlord: mergeQuestionnaire(landlord),
};

const getQuestionnaire = (type) => QUESTIONNAIRES[type] || null;

const getQuestions = (type) => {
  const q = QUESTIONNAIRES[type];
  return q ? q.questions : [];
};

const getPartAQuestions = (type) =>
  getQuestions(type).filter((question) => question.part === 'A');

const getSectionOrder = (type) => {
  const q = QUESTIONNAIRES[type];
  return q ? q.sections : [];
};

const getQuestionByKey = (type, key) =>
  getQuestions(type).find((question) => question.key === key) || null;

const PART_A_KEYS = { tenant: ['T0', 'T1'], landlord: ['L0', 'L1'] };

const isPartAComplete = (type, answers, consentFlags) => {
  // Consent gate: if any consent answer ends the survey, Part A is satisfied
  // (the respondent was legitimately screened out).
  const consentQuestions = getPartAQuestions(type).filter((q) => q.analysis === 'consent');
  for (const cq of consentQuestions) {
    const value = answers[cq.key];
    if (value && cq.endsOn && value === cq.endsOn) {
      return true;
    }
  }

  for (const question of getPartAQuestions(type)) {
    if (!question.required) continue;
    if (question.type === 'likert') {
      if (answers[question.key] === undefined || answers[question.key] === null || answers[question.key] === '') {
        return false;
      }
    } else if (answers[question.key] === undefined || answers[question.key] === null || answers[question.key] === '') {
      return false;
    }
  }
  return true;
};

module.exports = {
  SURVEY_VERSION,
  QUESTIONNAIRES,
  LANGUAGES,
  getQuestionnaire,
  getQuestions,
  getPartAQuestions,
  getSectionOrder,
  getQuestionByKey,
  PART_A_KEYS,
  isPartAComplete,
};
