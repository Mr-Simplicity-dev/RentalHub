const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatDateTime = (date) => {
  return new Date(date).toLocaleString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getTimeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  
  return Math.floor(seconds) + ' seconds ago';
};

const truncateText = (text, maxLength) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const validateNIN = (nin) => {
  return /^\d{11}$/.test(nin);
};

const validatePhone = (phone) => {
  return /^(\+234|0)[789]\d{9}$/.test(phone);
};

/**
 * Validate a phone number against the registration tier's expected format.
 * - local: Nigerian mobile numbers (+234/0 followed by 7/8/9 and nine digits)
 * - diaspora: any E.164 international number (+[country][national number])
 */
const validatePhoneForTier = (phone, tier = 'local') => {
  const value = String(phone || '').replace(/\s+/g, '');
  if (!value) {
    return { valid: false, message: 'Phone number is required' };
  }

  if (tier === 'diaspora') {
    if (!/^\+[1-9]\d{7,14}$/.test(value)) {
      return {
        valid: false,
        message: 'Enter a valid international phone number in E.164 format (for example +447911123456)',
      };
    }
    return { valid: true, value, message: 'Phone number format is valid' };
  }

  if (!/^(\+234|0)[789]\d{9}$/.test(value)) {
    return {
      valid: false,
      message: 'Enter a valid Nigerian mobile number (for example 08031234567 or +2348031234567)',
    };
  }
  return { valid: true, value, message: 'Phone number format is valid' };
};

const getStatusColor = (status) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    withdrawn: 'bg-gray-100 text-gray-800',
    completed: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

module.exports = {
  formatCurrency,
  formatDate,
  formatDateTime,
  getTimeAgo,
  truncateText,
  validateNIN,
  validatePhone,
  validatePhoneForTier,
  getStatusColor,
};
