const db = require('../config/middleware/database');

// Phone numbers are written in two shapes across the platform: marketing
// imports keep local digits (0803...) while WhatsApp and users keep E.164
// (234803...). Comparing digits only means a number that already exists in
// one shape is still recognised in the other, so a contact can never be
// imported twice by accident.
const phoneKey = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('234') && digits.length === 13) return digits.slice(3);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits.length === 10 ? digits : digits;
};

// A Nigerian number is only usable when it reduces to a 10-digit national
// number starting with 7, 8 or 9.
const isUsableNigerianNumber = (phone) => {
  const key = phoneKey(phone);
  return Boolean(key && key.length === 10 && /^[789]/.test(key));
};

// Every number the platform already knows about, keyed by national digits.
// Sources: registered users, both marketing lists, and survey respondents.
const collectKnownPhones = async () => {
  const known = new Map();

  const remember = (phone, source) => {
    const key = phoneKey(phone);
    if (!key) return;
    if (!known.has(key)) known.set(key, source);
  };

  const [users, smsSubscribers, waContacts, surveyLeads] = await Promise.all([
    db.query(`SELECT phone FROM users WHERE phone IS NOT NULL AND phone <> ''`),
    db.query(`SELECT phone FROM sms_subscribers WHERE phone IS NOT NULL AND phone <> ''`),
    db.query(`SELECT phone FROM whatsapp_contacts WHERE phone IS NOT NULL AND phone <> ''`),
    db.query(
      `SELECT respondent_phone AS phone FROM survey_responses
       WHERE respondent_phone IS NOT NULL AND respondent_phone <> ''`
    ).catch(() => ({ rows: [] })),
  ]);

  for (const row of users.rows) remember(row.phone, 'user');
  for (const row of smsSubscribers.rows) remember(row.phone, 'sms');
  for (const row of waContacts.rows) remember(row.phone, 'whatsapp');
  for (const row of surveyLeads.rows) remember(row.phone, 'survey');

  return known;
};

// Splits an uploaded list into numbers that are genuinely new and numbers
// that must be refused because the platform already has them. Nothing is
// written here, so both marketing channels can reuse the verdict.
const classifyNewPhones = async (phones = [], { excludeKey = null } = {}) => {
  const known = await collectKnownPhones();
  const seen = new Set();
  const accepted = [];
  let alreadyKnown = 0;
  let invalid = 0;
  let duplicates = 0;

  for (const raw of Array.isArray(phones) ? phones : []) {
    const key = phoneKey(raw);
    if (!key || !isUsableNigerianNumber(raw)) {
      invalid++;
      continue;
    }
    if (excludeKey && key === excludeKey) {
      alreadyKnown++;
      continue;
    }
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    if (known.has(key)) {
      alreadyKnown++;
      continue;
    }
    accepted.push(String(raw).trim());
  }

  return { accepted, alreadyKnown, invalid, duplicates };
};

module.exports = {
  phoneKey,
  isUsableNigerianNumber,
  collectKnownPhones,
  classifyNewPhones,
};
