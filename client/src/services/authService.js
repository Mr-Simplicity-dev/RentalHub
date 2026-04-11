import api from './api';
import { jwtDecode } from 'jwt-decode';
import {
  clearAuthSession,
  getAuthToken,
  getAuthUser,
  setAuthSession,
  setAuthUser,
} from './authStorage';

export const authService = {
  // Register
  register: async (userData) => {
    const response = await api.post('/auth/register', userData);
    if (response.data.success) {
      const { token, user } = response.data.data;
      setAuthSession(token, user);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return response.data;
  },

  // Login
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.success) {
      const { token, user } = response.data.data;
      setAuthSession(token, user);
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
    return response.data;
  },

  // Logout (NO redirect here)
  logout: () => {
    clearAuthSession();
    delete api.defaults.headers.common['Authorization'];
  },

  // Get current user
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    if (response.data.success) {
      setAuthUser(response.data.data);
    }
    return response.data;
  },

  // Verify email
  verifyEmail: async (token) => {
    const response = await api.get(`/auth/verify-email/${token}`);
    return response.data;
  },

  // Send phone OTP
  sendPhoneOTP: async () => {
    const response = await api.post('/auth/send-phone-otp');
    return response.data;
  },

  // Verify phone
  verifyPhone: async (otp) => {
    const response = await api.post('/auth/verify-phone', { otp });
    return response.data;
  },

  // Upload passport
  uploadPassport: async (file) => {
    const formData = new FormData();
    formData.append('passport', file);
    const response = await api.post('/auth/upload-passport', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Check if authenticated
  isAuthenticated: () => {
    const token = getAuthToken();
    if (!token) return false;

    try {
      const decoded = jwtDecode(token);
      return decoded.exp * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  // Get user from storage
  getUserFromStorage: () => {
    return getAuthUser();
  },

  // Forgot password
  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  // Reset password
  resetPassword: async (token, password) => {
    const response = await api.post(`/auth/reset-password/${token}`, { password });
    return response.data;
  },
};
