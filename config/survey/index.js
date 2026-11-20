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

const SURVEY_VERSION = 3;
const context = require('./context');

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

  if (question.key==='T0.3'||question.key==='L0.3') for(const lang of LANGUAGES) prompt[lang]=context[lang].consent;

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

const isScreenedOut = (type,answers={}) => getPartAQuestions(type).some(q=>q.endsOn&&String(answers[q.key])===String(q.endsOn));
const isAnswerValid = (question,answer) => {
 const empty=answer===undefined||answer===null||answer===''||(Array.isArray(answer)&&answer.length===0);
 if(empty)return question.required===false;
 if(question.type==='text')return typeof answer==='string'&&answer.trim().length>0&&answer.length<=5000;
 const choices=question.rankSource||(question.options||[]).map(option=>String(option.v));
 if(question.type==='multi'||question.type==='rank')return Array.isArray(answer)&&answer.length>=(question.minPicks||1)&&answer.length<=(question.maxPicks||choices.length)&&new Set(answer.map(String)).size===answer.length&&answer.every(value=>choices.includes(String(value)));
 return !Array.isArray(answer)&&['string','number'].includes(typeof answer)&&choices.includes(String(answer));
};
const getMissingQuestions = (type,answers={},partOnly=false) => isScreenedOut(type,answers)?[]:(partOnly?getPartAQuestions(type):getQuestions(type)).filter(q=>!isAnswerValid(q,answers[q.key])).map(q=>q.key);
const isPartAComplete = (type,answers={}) => getMissingQuestions(type,answers,true).length===0;

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
  getMissingQuestions,
  isAnswerValid,
  isScreenedOut,
};
