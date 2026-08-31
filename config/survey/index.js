/**
 * Survey index: merges tenant + landlord questionnaires and exposes helpers
 * used by the wizard API and the analysis engine.
 */

const tenant = require('./tenantQuestionnaire');
const landlord = require('./landlordQuestionnaire');

const SURVEY_VERSION = 1;

const QUESTIONNAIRES = { tenant, landlord };

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
  getQuestionnaire,
  getQuestions,
  getPartAQuestions,
  getSectionOrder,
  getQuestionByKey,
  PART_A_KEYS,
  isPartAComplete,
};
