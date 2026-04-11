import axios from 'axios';
import { clearAuthSession, getAuthToken } from './authStorage';

// Use relative /api so React proxy handles routing in development
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = getAuthToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor (NO hard redirect here)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuthSession();
      delete api.defaults.headers.common.Authorization;
      // Let React handle navigation
    }
    return Promise.reject(error);
  }
);

export default api;
