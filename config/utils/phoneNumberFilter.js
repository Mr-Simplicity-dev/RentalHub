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

const tokenize = (text) => {
  return text.toLowerCase().split(/[\s,;:!?()]+/).filter(Boolean);
};

const findDigitPhone = (text) => {
  for (const p of DIGIT_PATTERNS) {
    const m = text.match(p);
    if (m) return true;
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
        if (/^0[789]\d{9}$/.test(s)) return true;
        if (/^\d{11,15}$/.test(s)) return true;
      }
    } else {
      if (buf.length >= 10) {
        const s = buf.join('');
        if (/^0[789]\d{9}$/.test(s)) return true;
        if (/^\d{11,15}$/.test(s)) return true;
      }
      buf = [];
    }
  }

  if (buf.length >= 10) {
    const s = buf.join('');
    if (/^0[789]\d{9}$/.test(s)) return true;
    if (/^\d{11,15}$/.test(s)) return true;
  }

  return false;
};

const detectPhoneNumber = (text) => {
  if (!text || typeof text !== 'string') return { detected: false };
  const digitFound = findDigitPhone(text);
  const wordFound = findWordPhone(text);
  return { detected: digitFound || wordFound };
};

module.exports = { detectPhoneNumber };
