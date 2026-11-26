import { resetWebSession, webSessionHeaders } from './webSessionClient';
import api from './api';
import { jwtDecode } from 'jwt-decode';
import {
  clearAuthSession,
  beginAuthTransition,
  authGeneration,
  getAuthToken,
  getAuthUser,
  setAuthSession,
  setAuthUser,
} from './authStorage';

export const authService = {
  // Register
  register: async (userData) => {
  beginAuthTransition();
  const generation=authGeneration();
  const response = await api.post(
    '/auth/register',
    userData,
    {
      skipAuth: true,
      skipAuthRefresh: true,
    }
  );

  if(generation!==authGeneration())throw Error('Sign-in changed while the request was running.');

  if (response.data.success) {
    const { token, user } = response.data.data;

    setAuthSession(token, user);

    if (token) {
      api.defaults.headers.common.Authorization =
        `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }

  return response.data;
},

  // Login
  login: async (email, password, turnstileToken) => {
  beginAuthTransition();
  const generation=authGeneration();
  const response = await api.post(
    '/auth/login',
    {
      email,
      password,
      turnstile_token: turnstileToken,
    },
    {
      skipAuth: true,
      skipAuthRefresh: true,
    }
  );

  if(generation!==authGeneration())throw Error('Sign-in changed while the request was running.');

  if (response.data.success) {
    const { token, user } = response.data.data;

    setAuthSession(token, user);

    if (token) {
      api.defaults.headers.common.Authorization =
        `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  }

  return response.data;
},

  // Google OAuth Sign-in
  googleAuth: async (credential) => {
    beginAuthTransition();
    const generation=authGeneration();
    const response = await api.post(
      '/auth/google',
      { credential },
      {
        skipAuth: true,
        skipAuthRefresh: true,
      }
    );

    if(generation!==authGeneration())throw Error('Sign-in changed while the request was running.');

    if (response.data.success && response.data.data) {
      const { token, user } = response.data.data;
      setAuthSession(token, user);
      if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
      }
    }

    return response.data;
  },

  clearLocalSession: () => {
    clearAuthSession();
    delete api.defaults.headers.common['Authorization'];
    // Note: rememberedEmail is intentionally NOT cleared here so that
    // "Remember Me" persists across logout and expired sessions.
  },

  // Logout (NO redirect here)
  logout: async ({ remote = true } = {}) => {
    const headers=await webSessionHeaders();
    beginAuthTransition();
    const ending=remote ? api.post('/auth/logout',{}, {headers,explicitSession:true,skipAuthRefresh:true,timeout:5000}).catch(()=>{}) : Promise.resolve();
    authService.clearLocalSession();
    await resetWebSession().catch(()=>{});
    await ending;
  },

  // Get current user
 
getCurrentUser: async () => {
  const generation=authGeneration();
  if(!getAuthToken()) await api.get('/auth/session',{skipAuthRefresh:true});
  const response = await api.get('/auth/me', {
    // Recover an expired access token from the valid HttpOnly cookie.
    skipAuthRefresh: false,
  });

  if(generation!==authGeneration())throw Error('Sign-in changed while the request was running.');

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
