const DIGIT_PATTERNS = [
  // +234 or 234 or 0 followed by 07|08|09|01 and 8 digits (Nigerian mobile)
  /(?:\+?234[\s\-.]?0?|0)[789]\d[\s\-.]?\d{3}[\s\-.]?\d{3}[\s\-.]?\d{3,4}\b/,
  // +234/0 followed by 10 digits with optional separators
  /(?:\+?234[\s\-.]?0?|0)\d{10}\b/,
  // Plain 11-digit number starting with 0
  /\b0\d{10}\b/,
  // International: + and 1-3 digit country code then number
  /\+\d{1,3}[\s\-.]?\d{4,}[\s\-.]?\d{4,}\b/,
  // 10-15 consecutive digits alone on a line or bounded by non-digits
  /(?:^|[\s,;:!?()])(\d{10,15})(?:$|[\s,;:!?()])/,
];

const WORD_MAP = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4',
  five: '5', six: '6', seven: '7', eight: '8', nine: '9',
};

const WORD_SET = new Set(Object.keys(WORD_MAP));

// Leet/visual character to digit mapping (case-insensitive)
const LEET_MAP = {
  o: '0', q: '0', d: '0',
  l: '1', i: '1', '|': '1', '!': '1',
  z: '2',
  e: '3',
  a: '4', h: '4',
  s: '5', '$': '5',
  g: '9', t: '7', b: '8',
};

const LEET_SET = new Set(Object.keys(LEET_MAP));

const tokenize = (text) => {
  return text.toLowerCase().split(/[\s,;:!?()]+/).filter(Boolean);
};

const isNigerianPhone = (digits) => {
  return /^0[789]\d{9}$/.test(digits) || /^234[789]\d{9}$/.test(digits) || (digits.length >= 11 && digits.length <= 15 && /^\d+$/.test(digits));
};

const findDigitPhone = (text) => {
  for (const p of DIGIT_PATTERNS) {
    if (p.test(text)) return true;
  }
  return false;
};

const findWordPhone = (text) => {
  const tokens = tokenize(text);
  let buf = [];

  for (const t of tokens) {
    const isNumWord = WORD_SET.has(t);
    const isDigitStr = /^\d+$/.test(t);
    if (isNumWord || isDigitStr) {
      buf.push(isNumWord ? WORD_MAP[t] : t);
      if (buf.length > 15) buf.shift();
      if (buf.length >= 10) {
        const s = buf.join('');
        if (isNigerianPhone(s)) return true;
      }
    } else {
      if (buf.length >= 10) {
        const s = buf.join('');
        if (isNigerianPhone(s)) return true;
      }
      buf = [];
    }
  }

  if (buf.length >= 10) {
    const s = buf.join('');
    if (isNigerianPhone(s)) return true;
  }

  return false;
};

const findListBypassPhone = (text) => {
  const lines = text.split('\n');
  const leadingDigits = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const m = trimmed.match(/^(\d+)\s*[.):\]>\-]/);
    if (m) {
      leadingDigits.push(m[1]);
    }
  }

  if (leadingDigits.length < 11) return false;

  // Check sequential leading number groups as-is
  for (let start = 0; start <= leadingDigits.length - 11; start++) {
    const chunk = leadingDigits.slice(start, start + 11).join('');
    if (isNigerianPhone(chunk)) return true;
  }

  // Also try first digit of each number group (avoids "10." being treated as "10")
  for (let start = 0; start <= leadingDigits.length - 11; start++) {
    const chunk = leadingDigits.slice(start, start + 11).map(d => d[0]).join('');
    if (isNigerianPhone(chunk)) return true;
  }

  return false;
};

const findLeetEncodedPhone = (text) => {
  // Find sequences where all chars are digits or leet chars
  const leetChars = [...LEET_SET].concat(['0','1','2','3','4','5','6','7','8','9']).join('');
  const leetWords = text.toLowerCase().split(/[\s,;:!?()]+/).filter(Boolean);

  let buf = [];
  for (const word of leetWords) {
    // Check if every char in word is a leet char OR a digit
    const allLeet = [...word].every(c => LEET_SET.has(c) || /^\d$/.test(c));
    if (allLeet && word.length > 0) {
      const decoded = [...word].map(c => LEET_MAP[c] || c).join('');
      buf.push(decoded);
      if (buf.join('').length >= 10) {
        const s = buf.join('');
        if (isNigerianPhone(s)) return true;
      }
    } else {
      // Still check if the current buffer has a phone number
      if (buf.length > 0) {
        const s = buf.join('');
        if (s.length >= 10 && isNigerianPhone(s)) return true;
      }
      buf = [];
    }
  }

  if (buf.length > 0) {
    const s = buf.join('');
    if (s.length >= 10 && isNigerianPhone(s)) return true;
  }

  return false;
};

const detectPhoneNumber = (text) => {
  if (!text || typeof text !== 'string') return { detected: false };
  const digitFound = findDigitPhone(text);
  const wordFound = findWordPhone(text);
  const listFound = findListBypassPhone(text);
  const leetFound = findLeetEncodedPhone(text);
  return { detected: digitFound || wordFound || listFound || leetFound };
};

module.exports = { detectPhoneNumber };
