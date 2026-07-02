const axios = require('axios');
const { normalizePremblyResponse } = require('./premblyResponse');

/**
 * Prembly Identity Verification Service
 * Unified NIN and Passport verification with advanced KYC/AML features
 * 
 * Environment Variables Required:
 * - PREMBLY_SECRET_KEY: Your Prembly secret key (used as Bearer token)
 * - PREMBLY_PUBLIC_KEY: Your Prembly public key (used as x-app-id)
 * - PREMBLY_API_URL: (optional) Base URL for Prembly API (default: https://api.prembly.com)
 * - PREMBLY_API_TIMEOUT_MS: (optional) Request timeout in milliseconds (default: 15000)
 */

const PREMBLY_BASE_URL = process.env.PREMBLY_API_URL || 'https://api.prembly.com';
const PREMBLY_SECRET_KEY = process.env.PREMBLY_SECRET_KEY || process.env.PREMBLY_API_KEY;
const PREMBLY_PUBLIC_KEY = process.env.PREMBLY_PUBLIC_KEY || process.env.PREMBLY_APP_ID;
const PREMBLY_TIMEOUT_MS = Number(process.env.PREMBLY_API_TIMEOUT_MS || 15000);

const getPremblyHeaders = (includeJson = false) => ({
  'Authorization': `Bearer ${PREMBLY_SECRET_KEY}`,
  'x-app-id': PREMBLY_PUBLIC_KEY,
  'app-id': PREMBLY_PUBLIC_KEY,
  'x-api-key': PREMBLY_SECRET_KEY,
  ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
});

const addCallbackUrl = (payload, options = {}) => {
  const callbackUrl = String(options.callbackUrl || '').trim();
  return callbackUrl ? { ...payload, callback_url: callbackUrl } : payload;
};

const normalizeVerificationResponse = (body, fallbackMessage, fallbackReference = null) => {
  const result = normalizePremblyResponse(body, fallbackReference);
  return {
    ...result,
    message:
      result.message === 'Prembly verification response received'
        ? fallbackMessage
        : result.message,
  };
};

exports.isPremblyConfigured = () => Boolean(PREMBLY_SECRET_KEY && PREMBLY_PUBLIC_KEY);

/**
 * Validate NIN format (11 digits)
 * This is a lightweight format check before API verification
 */
exports.validateNIN = (nin) => {
  const ninRegex = /^\d{11}$/;
  
  if (!ninRegex.test(nin)) {
    return {
      valid: false,
      message: 'NIN must be exactly 11 digits'
    };
  }

  return {
    valid: true,
    value: nin.trim(),
    message: 'NIN format is valid'
  };
};

/**
 * Validate international passport format
 * This is a lightweight format check before API verification
 */
exports.validateInternationalPassport = (passportNumber) => {
  const value = String(passportNumber || '').trim().toUpperCase();

  if (!value) {
    return {
      valid: false,
      message: 'Passport number is required'
    };
  }

  // Common passport format: 6-20 alphanumeric chars
  if (!/^[A-Z0-9]{6,20}$/.test(value)) {
    return {
      valid: false,
      message: 'Invalid passport number format. Expected 6-20 alphanumeric characters'
    };
  }

  return {
    valid: true,
    value,
    message: 'Passport number format is valid'
  };
};

/**
 * Verify NIN with Prembly
 * Uses Prembly's verifyidentity endpoint for Nigerian NIN verification
 * 
 * @param {string} nin - 11-digit NIN
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {string} dateOfBirth - ISO date (YYYY-MM-DD)
 * @returns {Promise<Object>} Verification result with verified status
 */
exports.verifyNINWithPrembly = async (
  nin,
  firstName,
  lastName,
  dateOfBirth,
  options = {}
) => {
  if (!PREMBLY_SECRET_KEY || !PREMBLY_PUBLIC_KEY) {
    return {
      verified: false,
      status: 'not_configured',
      message: 'Prembly integration is not configured. Set PREMBLY_SECRET_KEY and PREMBLY_PUBLIC_KEY'
    };
  }

  try {
    // Prembly National ID endpoint
    const response = await axios.post(
      `${PREMBLY_BASE_URL}/identityverification/verify/national_id`,
      addCallbackUrl({
        id_number: nin,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
      }, options),
      {
        timeout: PREMBLY_TIMEOUT_MS,
        headers: getPremblyHeaders(true)
      }
    );

    const body = response.data || {};
    return normalizeVerificationResponse(body, 'NIN verification response received');
  } catch (error) {
    if (error.response?.data) {
      const result = normalizeVerificationResponse(
        error.response.data,
        'NIN verification response received'
      );
      if (result.status !== 'service_error' || result.reference_id) {
        return {
          ...result,
          error_code: error.response?.status || error.code,
        };
      }
    }

    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      verified: false,
      status: 'service_error',
      message: `NIN verification failed: ${apiMessage}`,
      error_code: error.response?.status || error.code
    };
  }
};

/**
 * Verify international passport with Prembly
 * Uses Prembly's passport verification endpoint
 * 
 * @param {string} passportNumber - Passport number
 * @param {string} fullName - User's full name
 * @param {string} nationality - User's nationality/country
 * @param {string} dateOfBirth - ISO date (YYYY-MM-DD)
 * @returns {Promise<Object>} Verification result with verified status
 */
exports.verifyInternationalPassportWithPrembly = async (
  passportNumber,
  fullName,
  nationality,
  dateOfBirth,
  options = {}
) => {
  if (!PREMBLY_SECRET_KEY || !PREMBLY_PUBLIC_KEY) {
    return {
      verified: false,
      status: 'not_configured',
      message: 'Prembly integration is not configured. Set PREMBLY_SECRET_KEY and PREMBLY_PUBLIC_KEY'
    };
  }

  try {
    // Prembly International Passport endpoint
    const response = await axios.post(
      `${PREMBLY_BASE_URL}/identityverification/verify/international_passport`,
      addCallbackUrl({
        passport_number: passportNumber,
        full_name: fullName,
        country: nationality,
        date_of_birth: dateOfBirth,
      }, options),
      {
        timeout: PREMBLY_TIMEOUT_MS,
        headers: getPremblyHeaders(true)
      }
    );

    const body = response.data || {};
    return normalizeVerificationResponse(body, 'Passport verification response received');
  } catch (error) {
    if (error.response?.data) {
      const result = normalizeVerificationResponse(
        error.response.data,
        'Passport verification response received'
      );
      if (result.status !== 'service_error' || result.reference_id) {
        return {
          ...result,
          error_code: error.response?.status || error.code,
        };
      }
    }

    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      verified: false,
      status: 'service_error',
      message: `Passport verification failed: ${apiMessage}`,
      error_code: error.response?.status || error.code
    };
  }
};

/**
 * Perform advanced KYC check with Prembly
 * Includes AML screening, identity verification, and fraud detection
 * 
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @param {string} dateOfBirth - ISO date (YYYY-MM-DD)
 * @param {string} idNumber - NIN or Passport number
 * @param {string} idType - 'nin' or 'passport'
 * @returns {Promise<Object>} KYC result with risk assessment
 */
exports.performKYCCheckWithPrembly = async (
  firstName,
  lastName,
  dateOfBirth,
  idNumber,
  idType = 'nin'
) => {
  if (!PREMBLY_SECRET_KEY || !PREMBLY_PUBLIC_KEY) {
    return {
      status: 'not_configured',
      message: 'Prembly integration is not configured',
      risk_level: null
    };
  }

  try {
    const endpoint = idType === 'passport'
      ? `${PREMBLY_BASE_URL}/kyc/international_passport`
      : `${PREMBLY_BASE_URL}/kyc/national_id`;

    const payload = idType === 'passport'
      ? {
          passport_number: idNumber,
          full_name: `${firstName} ${lastName}`,
          date_of_birth: dateOfBirth
        }
      : {
          id_number: idNumber,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dateOfBirth
        };

    const response = await axios.post(endpoint, payload, {
      timeout: PREMBLY_TIMEOUT_MS,
      headers: {
        'Authorization': `Bearer ${PREMBLY_SECRET_KEY}`,
        'x-app-id': PREMBLY_PUBLIC_KEY,
        'Content-Type': 'application/json'
      }
    });

    const body = response.data || {};
    const data = body.data || {};

    return {
      status: body.status || 'completed',
      verified: data.verification_status === 'verified',
      risk_level: data.risk_level || 'unknown', // low, medium, high
      aml_status: data.aml_status, // clean, flagged
      message: body.message || 'KYC check completed',
      details: {
        identity_verified: data.verification_status === 'verified',
        aml_clear: data.aml_status === 'clean',
        risk_assessment: data.risk_level,
        report_id: data.report_id
      }
    };
  } catch (error) {
    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      status: 'service_error',
      message: `KYC check failed: ${apiMessage}`,
      risk_level: null,
      error_code: error.response?.status || error.code
    };
  }
};

/**
 * Perform liveness check with face matching
 * Advanced fraud detection feature
 * 
 * @param {Buffer} imageBuffer - Image file buffer or path
 * @param {string} fullName - User's full name
 * @returns {Promise<Object>} Liveness check result
 */
exports.performLivenessCheckWithPrembly = async (imageBuffer, fullName) => {
  if (!PREMBLY_SECRET_KEY || !PREMBLY_PUBLIC_KEY) {
    return {
      status: 'not_configured',
      message: 'Prembly integration is not configured',
      is_live: false
    };
  }

  try {
    const formData = new FormData();
    formData.append('image', imageBuffer);
    formData.append('full_name', fullName);

    const response = await axios.post(
      `${PREMBLY_BASE_URL}/biometric/liveness`,
      formData,
      {
        timeout: PREMBLY_TIMEOUT_MS,
        headers: {
          'Authorization': `Bearer ${PREMBLY_SECRET_KEY}`,
          'x-app-id': PREMBLY_PUBLIC_KEY,
          ...formData.getHeaders()
        }
      }
    );

    const body = response.data || {};
    const data = body.data || {};

    return {
      status: body.status || 'completed',
      is_live: data.is_live === true,
      confidence: data.confidence || null,
      message: body.message || 'Liveness check completed',
      details: {
        is_real_person: data.is_live === true,
        confidence_score: data.confidence
      }
    };
  } catch (error) {
    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      status: 'service_error',
      message: `Liveness check failed: ${apiMessage}`,
      is_live: false,
      error_code: error.response?.status || error.code
    };
  }
};

/**
 * Get verification status
 * Retrieve the status of a previous verification attempt
 * 
 * @param {string} referenceId - Reference ID from Prembly
 * @returns {Promise<Object>} Current verification status
 */
exports.getVerificationStatusWithPrembly = async (referenceId) => {
  if (!PREMBLY_SECRET_KEY || !PREMBLY_PUBLIC_KEY) {
    return {
      status: 'not_configured',
      message: 'Prembly integration is not configured'
    };
  }

  try {
    const response = await axios.get(
      `${PREMBLY_BASE_URL}/verification/${encodeURIComponent(referenceId)}/status`,
      {
        timeout: PREMBLY_TIMEOUT_MS,
        headers: getPremblyHeaders(false)
      }
    );

    const body = response.data || {};
    return normalizeVerificationResponse(
      body,
      'Prembly verification status retrieved',
      referenceId
    );
  } catch (error) {
    if (error.response?.data) {
      const result = normalizeVerificationResponse(
        error.response.data,
        'Prembly verification status retrieved',
        referenceId
      );
      if (result.status !== 'service_error') {
        return {
          ...result,
          error_code: error.response?.status || error.code,
        };
      }
    }

    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      status: 'service_error',
      message: `Status check failed: ${apiMessage}`,
      error_code: error.response?.status || error.code
    };
  }
};

module.exports.verifyNINWithNIMC = exports.verifyNINWithPrembly;
module.exports.verifyInternationalPassportWithAPI = exports.verifyInternationalPassportWithPrembly;
