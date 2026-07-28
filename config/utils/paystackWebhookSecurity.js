const crypto = require('crypto');

const PAYSTACK_SIGNATURE_HEX_LENGTH = 128;

const verifyPaystackSignature = ({ rawBody, signature, secret }) => {
  if (
    !secret ||
    (!Buffer.isBuffer(rawBody) && typeof rawBody !== 'string') ||
    typeof signature !== 'string' ||
    signature.length !== PAYSTACK_SIGNATURE_HEX_LENGTH ||
    !/^[a-f0-9]+$/i.test(signature)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha512', secret)
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(signature, 'hex');

  return supplied.length === expected.length && crypto.timingSafeEqual(expected, supplied);
};

const amountMatchesStoredPayment = (storedAmountNaira, gatewayAmountKobo) => {
  const storedAmount = Number(storedAmountNaira);
  const gatewayAmount = Number(gatewayAmountKobo);

  if (
    !Number.isFinite(storedAmount) ||
    !Number.isSafeInteger(gatewayAmount) ||
    storedAmount < 0 ||
    gatewayAmount < 0
  ) {
    return false;
  }

  return Math.round(storedAmount * 100) === gatewayAmount;
};

module.exports = {
  amountMatchesStoredPayment,
  verifyPaystackSignature,
};
