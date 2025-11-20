// Basic NIN validation (11 digits)
// In production, integrate with NIMC API for real verification
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

// Function to verify NIN with NIMC API (implement when you have API access)
exports.verifyNINWithNIMC = async (nin, firstName, lastName, dateOfBirth) => {
  try {
    // TODO: Integrate with NIMC API
    // const response = await axios.post('https://api.nimc.gov.ng/verify', {
    //   nin,
    //   firstName,
    //   lastName,
    //   dateOfBirth
    // });
    
    // For now, return mock response
    return {
      verified: true,
      message: 'NIN verification pending admin approval'
    };
  } catch (error) {
    return {
      verified: false,
      message: 'NIN verification failed'
    };
  }
};