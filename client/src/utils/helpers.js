// src/utils/helpers.js
export const formatCurrency = (value) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(value || 0);

export const formatDate = (date) =>
  date ? new Date(date).toLocaleDateString() : '';
