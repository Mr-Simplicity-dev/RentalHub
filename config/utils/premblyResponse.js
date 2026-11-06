const crypto = require('crypto');

const cleanText = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

const normalizeVerificationStatus = (value) => {
  const text = cleanText(value);
  if (!text) return null;
  return text.toUpperCase().replace(/[\s_]+/g, '-');
};

const decodeResponseData = value => { if (typeof value !== 'string' || value.length > 2000000) return value; try { return JSON.parse(value); } catch { return null; } };
const responseContainers = (body = {}) => [
  body,
  body.verification,
  body.data,
  body.data?.verification,
  body.result,
  body.result?.verification,
  body.verification_response,
  body.verification_response?.data,
  body.data?.verification_response,
  body.data?.verification_response?.data,
  body.data?.verification_response?.verification,
  body.data?.verification?.data,
  body.verification?.data,
  body.data?.data,
  body.result?.data,
  decodeResponseData(body.response_data),
  decodeResponseData(body.data?.response_data),
].flatMap(value => Array.isArray(value) ? value : [value]).filter((value) => value && typeof value === 'object');

const firstValue = (containers, keys) => {
  for (const container of containers) {
    for (const key of keys) {
      const value = container[key];
      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }
  }
  return null;
};

const namePart = (value) => {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length < 2 || text.startsWith('[object')) return null;
  return text;
};

const deepNamePart = (node, keys, depth = 0) => {
  if (!node || typeof node !== 'object' || depth > 4) return null;
  for (const key of keys) {
    const value = namePart(node[key]);
    if (value) return value;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      const found = deepNamePart(value, keys, depth + 1);
      if (found) return found;
    }
  }
  return null;
};

// The official name on the identity record, not the name the applicant typed.
// A bank will only open a collection account in a name that matches the record,
// so this is the value used when a virtual account is created.
const extractVerifiedIdentityName = (body = {}) => {
  const containers = responseContainers(body);
  const surname =
    namePart(firstValue(containers, ['surname', 'lastname', 'last_name', 'family_name'])) ||
    deepNamePart(body, ['surname', 'lastname', 'last_name', 'family_name']);
  const firstName =
    namePart(firstValue(containers, ['firstname', 'first_name', 'givenname', 'given_name'])) ||
    deepNamePart(body, ['firstname', 'first_name', 'givenname', 'given_name']);
  const middleName =
    namePart(firstValue(containers, ['middlename', 'middle_name'])) ||
    deepNamePart(body, ['middlename', 'middle_name']);
  const combined = [firstName, middleName, surname].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  if (combined.length >= 3) return combined.slice(0, 200);

  const direct = namePart(
    firstValue(containers, ['full_name', 'fullName', 'customer_name', 'customerName', 'identity_name', 'name'])
  );
  return direct ? direct.slice(0, 200) : null;
};

const normalizeDocumentExpiry = value => {
  const text = cleanText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return text.slice(0,10);
  if (/^\d{8}$/.test(text)) return text.slice(0,4)+'-'+text.slice(4,6)+'-'+text.slice(6,8);
  return text;
};
const normalizePremblyResponse = (body = {}, fallbackReference = null) => {
  const containers = responseContainers(body);
  const responseCode = cleanText(firstValue(containers, ['response_code', 'responseCode']));
  const verificationStatus = normalizeVerificationStatus(
    body.verification_status || body.verificationStatus || (typeof body.verification?.status === 'string' ? body.verification.status : null) || (typeof body.data?.verification?.status === 'string' ? body.data.verification.status : null) || firstValue(containers, ['verification_status', 'verificationStatus'])
  );
  const referenceId = cleanText(
    firstValue(containers, [
      'reference',
      'reference_id',
      'referenceId',
      'transaction_reference',
      'transactionReference',
    ])
  ) || cleanText(fallbackReference);
  const billingValue = firstValue(containers, ['billing_status', 'billingStatus']);
  const billingStatus =
    typeof billingValue === 'boolean'
      ? billingValue
      : billingValue === null
        ? null
        : ['true', '1', 'yes', 'billed'].includes(String(billingValue).toLowerCase());
  const providerStatus = firstValue(containers, ['status']);
  const providerStatusText = cleanText(providerStatus)?.toLowerCase();
  const message =
    cleanText(firstValue(containers, ['message', 'detail', 'error'])) ||
    'Prembly verification response received';
  const documentCountry = cleanText(
    firstValue(containers, ['documentCountry', 'document_country', 'issuing_country']) || firstValue(containers, [
      'document_country',
      'issuing_country',
      'country_code',
      'country',
      'nationality',
    ])
  );

  let status = 'service_error';
  if (/token_not_valid|invalid.?api.?key|unauthori[sz]ed/i.test(message)) {
    status = 'service_error';
  } else if (verificationStatus === 'VERIFIED') {
    status = 'verified';
  } else if (verificationStatus === 'PENDING' || responseCode === '02') {
    status = 'provider_pending';
  } else if (
    ['NOT-VERIFIED', 'NOTVERIFIED', 'FAILED', 'INVALID'].includes(verificationStatus) ||
    responseCode === '01'
  ) {
    status = 'not_verified';
  } else if (responseCode === '03') {
    status = 'wallet_error';
  } else if (
    responseCode === '00' &&
    (providerStatus === true || providerStatusText === 'success')
  ) {
    status = 'verified';
  } else if (providerStatus === false || providerStatusText === 'failed') {
    status = 'not_verified';
  }

  return {
    verified: status === 'verified',
    pending: status === 'provider_pending',
    status,
    message,
    reference_id: referenceId,
    response_code: responseCode,
    verification_status: verificationStatus,
    billing_status: billingStatus,
    document_country: documentCountry,
    verified_name: extractVerifiedIdentityName(body),
    document_number: cleanText(firstValue(containers, ['documentNumber','document_number','passport_number','currentPassportNumber','identity_number'])),
    document_type: cleanText(firstValue(containers, ['documentType','document_type','identity_type'])),
    document_expiry: normalizeDocumentExpiry(firstValue(containers, ['expirationDate','expiry_date','expiryDate','date_of_expiry'])),
  };
};

const verifyPremblyWebhookSignature = ({ rawBody, signature, publicKey }) => {
  if (!rawBody || !signature || !publicKey) return false;

  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody));
  const expected = crypto
    .createHmac('sha256', publicKey)
    .update(payload)
    .digest('base64');
  const actualBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const getPremblyBackoffMinutes = (pollAttempt) => {
  const steps = [1, 5, 15, 30, 60, 180, 360];
  const index = Math.max(Number(pollAttempt) || 1, 1) - 1;
  return steps[Math.min(index, steps.length - 1)];
};

const buildPremblyRequestKey = ({
  contextType,
  contextId = null,
  identityType,
  subjectHash,
  email = '',
  phone = '',
}) => crypto
  .createHash('sha256')
  .update([
    String(contextType || ''),
    String(contextId || ''),
    String(identityType || ''),
    String(subjectHash || ''),
    String(email || '').trim().toLowerCase(),
    String(phone || '').replace(/\s+/g, ''),
  ].join(':'))
  .digest('hex');

module.exports = {
  normalizePremblyResponse,
  extractVerifiedIdentityName,
  verifyPremblyWebhookSignature,
  getPremblyBackoffMinutes,
  buildPremblyRequestKey,
};
