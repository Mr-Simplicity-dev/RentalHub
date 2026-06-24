const axios = require('axios');

// Basic NIN validation (11 digits)
exports.validateNIN = (nin) => {
  // NIN must be exactly 11 digits
  const ninRegex = /^\d{11}$/;
  
  if (!ninRegex.test(nin)) {
    return {
      valid: false,
      message: 'NIN must be exactly 11 digits'
    };
  }

  return {
    valid: true,
    message: 'NIN format is valid'
  };
};

// Basic international passport number validation
exports.validateInternationalPassport = (passportNumber) => {
  const value = String(passportNumber || '').trim().toUpperCase();

  if (!value) {
    return {
      valid: false,
      message: 'International passport number is required'
    };
  }

  // Common passport format: 6-20 alphanumeric chars
  if (!/^[A-Z0-9]{6,20}$/.test(value)) {
    return {
      valid: false,
      message: 'Invalid international passport number format'
    };
  }

  return {
    valid: true,
    value,
    message: 'Passport number format is valid'
  };
};

// Verify NIN with a configurable NIMC-compatible endpoint
// Required env vars:
// - NIMC_API_URL (full endpoint URL)
// - NIMC_API_KEY
exports.verifyNINWithNIMC = async (nin, firstName, lastName, dateOfBirth) => {
  const endpoint = process.env.NIMC_API_URL;
  const apiKey = process.env.NIMC_API_KEY;

  if (!endpoint || !apiKey) {
    return {
      verified: false,
      status: 'not_configured',
      message: 'NIMC integration is not configured'
    };
  }

  try {
    const authScheme = process.env.NIMC_AUTH_SCHEME || 'Bearer';
    const timeout = Number(process.env.NIMC_API_TIMEOUT_MS || 12000);

    const response = await axios.post(
      endpoint,
      {
        nin,
        firstName,
        lastName,
        dateOfBirth
      },
      {
        timeout,
        headers: {
          Authorization: `${authScheme} ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const body = response.data || {};
    const payload = body.data || body.result || body;
    const statusValue = String(
      payload.status || body.status || ''
    ).toLowerCase();

    const verified =
      payload.verified === true ||
      payload.is_verified === true ||
      statusValue === 'verified' ||
      statusValue === 'success';

    if (!verified) {
      return {
        verified: false,
        status: 'not_verified',
        message: payload.message || body.message || 'NIN could not be verified'
      };
    }

    return {
      verified: true,
      status: 'verified',
      message: payload.message || body.message || 'NIN verified successfully',
      raw: payload
    };
  } catch (error) {
    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      verified: false,
      status: 'service_error',
      message: `NIMC verification failed: ${apiMessage}`
    };
  }
};

// Verify international passport with a configurable endpoint
// Required env vars:
// - PASSPORT_API_URL (full endpoint URL)
// - PASSPORT_API_KEY
exports.verifyInternationalPassportWithAPI = async (
  passportNumber,
  fullName,
  nationality,
  dateOfBirth
) => {
  const endpoint = process.env.PASSPORT_API_URL;
  const apiKey = process.env.PASSPORT_API_KEY;

  if (!endpoint || !apiKey) {
    return {
      verified: false,
      status: 'not_configured',
      message: 'Passport verification integration is not configured'
    };
  }

  try {
    const authScheme = process.env.PASSPORT_AUTH_SCHEME || 'Bearer';
    const timeout = Number(process.env.PASSPORT_API_TIMEOUT_MS || 12000);

    const response = await axios.post(
      endpoint,
      {
        passportNumber,
        fullName,
        nationality,
        dateOfBirth
      },
      {
        timeout,
        headers: {
          Authorization: `${authScheme} ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const body = response.data || {};
    const payload = body.data || body.result || body;
    const statusValue = String(payload.status || body.status || '').toLowerCase();

    const verified =
      payload.verified === true ||
      payload.is_verified === true ||
      statusValue === 'verified' ||
      statusValue === 'success';

    if (!verified) {
      return {
        verified: false,
        status: 'not_verified',
        message: payload.message || body.message || 'Passport could not be verified'
      };
    }

    return {
      verified: true,
      status: 'verified',
      message: payload.message || body.message || 'Passport verified successfully',
      raw: payload
    };
  } catch (error) {
    const apiMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    return {
      verified: false,
      status: 'service_error',
      message: `Passport verification failed: ${apiMessage}`
    };
  }
};
