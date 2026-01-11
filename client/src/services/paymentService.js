import api from './api';

export const paymentService = {
  // Get subscription plans
  getSubscriptionPlans: async () => {
    const response = await api.get('/payments/subscription-plans');
    return response.data;
  },

  // Get listing plans
  getListingPlans: async () => {
    const response = await api.get('/payments/listing-plans');
    return response.data;
  },

  // Initialize subscription payment
  initializeSubscription: async (planId, paymentMethod) => {
    const response = await api.post('/payments/subscribe', {
      plan_id: planId,
      payment_method: paymentMethod
    });
    return response.data;
  },

  // Verify subscription payment
  verifySubscription: async (reference) => {
    const response = await api.get(`/payments/verify-subscription/${reference}`);
    return response.data;
  },

  // Get subscription status
  getSubscriptionStatus: async () => {
    const response = await api.get('/payments/subscription-status');
    return response.data;
  },

  // Initialize listing payment
  initializeListingPayment: async (planId, propertyId, paymentMethod) => {
    const response = await api.post('/payments/pay-listing', {
      plan_id: planId,
      property_id: propertyId,
      payment_method: paymentMethod
    });
    return response.data;
  },

  // Verify listing payment
  verifyListingPayment: async (reference) => {
    const response = await api.get(`/payments/verify-listing/${reference}`);
    return response.data;
  },

  // Initialize rent payment
  initializeRentPayment: async (propertyId, amount, paymentMethod) => {
    const response = await api.post('/payments/pay-rent', {
      property_id: propertyId,
      amount,
      payment_method: paymentMethod
    });
    return response.data;
  },

  // Verify rent payment
  verifyRentPayment: async (reference) => {
    const response = await api.get(`/payments/verify-rent/${reference}`);
    return response.data;
  },

  // Get payment history
  getPaymentHistory: async (params) => {
    const response = await api.get('/payments/history', { params });
    return response.data;
  },

  // Get payment details
  getPaymentDetails: async (paymentId) => {
    const response = await api.get(`/payments/${paymentId}`);
    return response.data;
  },
};