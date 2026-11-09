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

    if (SANITIZED_KEYS.has(key) && typeof value === 'string') {
      sanitized[key] = value.trim();
    } else {
      sanitized[key] = sanitizeValue(value, depth === 0 ? MAX_STRING_LENGTH : 5000);
    }
  }
  return sanitized;
};

const inputSanitizer = (req, res, next) => {
  if (req.body && isObject(req.body)) {
    req.body = sanitizeObject(req.body);
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
