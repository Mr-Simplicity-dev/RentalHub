const ALLOWED_CREDENTIAL_REVALIDATION_FIELDS = new Set([
  'nin',
  'international_passport',
  'live_photo',
]);

const normalizeCredentialRevalidationFields = (fields) =>
  [...new Set((Array.isArray(fields) ? fields : []).map((field) => String(field).trim()))]
    .filter((field) => ALLOWED_CREDENTIAL_REVALIDATION_FIELDS.has(field));

const maskCredentialValue = (value) => {
  const text = String(value || '');
  return text ? `${'*'.repeat(Math.max(text.length - 4, 4))}${text.slice(-4)}` : null;
};

const isValidCredentialBirthDate = (value) => {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isRealCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;

  if (!isRealCalendarDate) return false;

  const now = new Date();
  const today = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  ));
  return date < today;
};

module.exports = {
  normalizeCredentialRevalidationFields,
  maskCredentialValue,
  isValidCredentialBirthDate,
};
