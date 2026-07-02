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
].filter((value) => value && typeof value === 'object');

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

const normalizePremblyResponse = (body = {}, fallbackReference = null) => {
  const containers = responseContainers(body);
  const responseCode = cleanText(firstValue(containers, ['response_code', 'responseCode']));
  const verificationStatus = normalizeVerificationStatus(
    firstValue(containers, ['verification_status', 'verificationStatus'])
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

  let status = 'service_error';
  if (verificationStatus === 'VERIFIED') {
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
  verifyPremblyWebhookSignature,
  getPremblyBackoffMinutes,
  buildPremblyRequestKey,
};
