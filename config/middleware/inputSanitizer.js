// Global input sanitizer middleware — defense-in-depth against XSS, NoSQL
// injection, and excessively large payloads. Runs after body parser.

const MAX_STRING_LENGTH = Number(process.env.INPUT_MAX_STRING_LENGTH) || 10000;

const stripTags = (value) => String(value).replace(/<[^>]*>/g, '');

const truncate = (value, maxLen) => {
  const s = String(value);
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const sanitizeValue = (value, maxLen = MAX_STRING_LENGTH) => {
  if (typeof value === 'string') {
    return truncate(stripTags(value), maxLen);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeValue(v, maxLen));
  }
  if (isObject(value)) {
    return sanitizeObject(value);
  }
  return value;
};

const SANITIZED_KEYS = new Set([
  'nin', 'email', 'phone', 'password', 'password_hash',
  'token', 'refreshToken', 'apiKey', 'secret',
]);

const sanitizeObject = (obj, depth = 0) => {
  if (depth > 10) return obj;
  if (!isObject(obj)) return obj;

  const sanitized = {};
  for (let key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }
    const value = obj[key];

    if (key === 'passport_document_image' && typeof value === 'string' && /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.trim())) {
      sanitized[key] = truncate(value.trim(), 710001);
    } else if (SANITIZED_KEYS.has(key) && typeof value === 'string') {
      sanitized[key] = value.trim();
    } else {
      sanitized[key] = sanitizeValue(value, depth === 0 ? MAX_STRING_LENGTH : 5000);
    }
  }
  return sanitized;
};

// Only the questionnaire's exact answer IDs may contain dots, and only on
// survey write routes. Values still pass through the normal text cleaner.
const surveyAnswerKeys = new Set(['tenant', 'landlord'].flatMap(type =>
  require('../survey').getQuestions(type).map(question => question.key)));
const surveyWrites = new Set(['/api/survey/save', '/api/survey/public/submit', '/api/survey/public/draft', '/api/admin/survey/paper-entry']);
const inputSanitizer = (req, res, next) => {
  const route = String(req.originalUrl || '').split('?')[0].replace(/\/$/, '');
  let surveyAnswers;
  if (req.method === 'POST' && surveyWrites.has(route) && isObject(req.body?.answers)) {
    surveyAnswers = {};
    for (const [key, value] of Object.entries(req.body.answers)) {
      if (!surveyAnswerKeys.has(key)) continue;
      if (isObject(value) || (Array.isArray(value) && value.some(item => isObject(item) || Array.isArray(item)))) continue;
      surveyAnswers[key] = sanitizeValue(value, 5000);
    }
  }
  if (req.body && isObject(req.body)) {
    req.body = sanitizeObject(req.body);
    if (surveyAnswers) req.body.answers = surveyAnswers;
  }
  if (req.query && isObject(req.query)) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && isObject(req.params)) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

module.exports = inputSanitizer;
