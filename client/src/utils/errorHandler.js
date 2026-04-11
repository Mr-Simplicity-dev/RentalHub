/**
 * Error handling utility for consistent error messages across the application
 */

export const handleButtonError = (error, buttonType) => {
  const errorMap = {
    'withdrawal': {
      'insufficient_funds': 'Insufficient funds for withdrawal',
      'minimum_amount': 'Minimum withdrawal amount is ₦5,000',
      'pending_request': 'You have a pending withdrawal request',
      'network_error': 'Network error. Please check your connection',
      'validation_error': 'Please enter a valid withdrawal amount',
      'default': 'Failed to process withdrawal request'
    },
    'payment': {
      'network_error': 'Network error. Please check your connection',
      'payment_failed': 'Payment failed. Please try again',
      'insufficient_funds': 'Insufficient funds in your account',
      'transaction_timeout': 'Transaction timed out. Please try again',
      'cancelled': 'Payment was cancelled',
      'default': 'Payment processing failed'
    },
    'upload': {
      'file_too_large': 'File size exceeds 5MB limit',
      'invalid_format': 'Only JPG, PNG, and PDF files are allowed',
      'network_error': 'Network error. Please try again',
      'server_error': 'Server error. Please try again later',
      'default': 'Upload failed. Please try again'
    },
    'auth': {
      'invalid_credentials': 'Invalid email or password',
      'account_locked': 'Account is temporarily locked',
      'email_not_verified': 'Please verify your email first',
      'network_error': 'Network error. Please check your connection',
      'default': 'Authentication failed'
    },
    'form': {
      'validation_error': 'Please fill in all required fields',
      'invalid_email': 'Please enter a valid email address',
      'invalid_phone': 'Please enter a valid phone number',
      'password_mismatch': 'Passwords do not match',
      'default': 'Form submission failed'
    },
    'admin': {
      'bulk_action_failed': 'Some actions failed to process',
      'permission_denied': 'You do not have permission for this action',
      'network_error': 'Network error. Please check your connection',
      'default': 'Admin action failed'
    },
    'property': {
      'unlock_failed': 'Failed to unlock property details',
      'save_failed': 'Failed to save property',
      'application_failed': 'Failed to submit application',
      'network_error': 'Network error. Please check your connection',
      'default': 'Property action failed'
    }
  };

  // Extract error code from response if available
  const errorCode = error?.response?.data?.code || 
                   error?.code || 
                   (error?.message?.toLowerCase().includes('network') ? 'network_error' : null) ||
                   (error?.response?.status === 422 ? 'validation_error' : null) ||
                   (error?.response?.status === 403 ? 'permission_denied' : null) ||
                   (error?.response?.status === 401 ? 'invalid_credentials' : null);

  const message = errorMap[buttonType]?.[errorCode] || 
                  errorMap[buttonType]?.default || 
                  error?.response?.data?.message || 
                  error?.message || 
                  'An error occurred';

  return message;
};

/**
 * Parse API error response for detailed error information
 */
export const parseApiError = (error) => {
  if (!error) return { message: 'Unknown error', code: 'unknown' };
  
  if (error.response) {
    // Server responded with error status
    return {
      message: error.response.data?.message || 'Server error',
      code: error.response.data?.code || `http_${error.response.status}`,
      status: error.response.status,
      data: error.response.data
    };
  } else if (error.request) {
    // Request made but no response
    return {
      message: 'Network error. Please check your connection',
      code: 'network_error',
      request: error.request
    };
  } else {
    // Error in setting up request
    return {
      message: error.message || 'Request setup failed',
      code: 'request_error'
    };
  }
};

/**
 * Check if error is retryable
 */
export const isRetryableError = (error) => {
  const retryableCodes = [
    'network_error',
    'timeout',
    'server_error',
    'http_500',
    'http_502',
    'http_503',
    'http_504'
  ];
  
  const parsedError = parseApiError(error);
  return retryableCodes.includes(parsedError.code) || 
         parsedError.status >= 500;
};

/**
 * Format error for display
 */
export const formatErrorForDisplay = (error, context = '') => {
  const parsed = parseApiError(error);
  let message = parsed.message;
  
  if (context) {
    message = `${context}: ${message}`;
  }
  
  return {
    message,
    code: parsed.code,
    isRetryable: isRetryableError(error),
    details: parsed.data
  };
};