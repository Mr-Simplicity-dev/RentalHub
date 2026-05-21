import axios from 'axios';
import { clearAuthSession, getAuthToken } from './authStorage';

// Use relative /api so React proxy handles routing in development
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';
const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete']);

const getCookieValue = (name) => {
  if (typeof document === 'undefined') return '';
  const cookies = document.cookie ? document.cookie.split(';') : [];
  const prefix = `${name}=`;
  const match = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix));

  return match ? decodeURIComponent(match.slice(prefix.length)) : '';
};

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
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

    const method = String(config.method || 'get').toLowerCase();
    const csrfToken = getCookieValue('csrf_token');
    if (csrfToken && MUTATING_METHODS.has(method)) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }

    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (typeof config.headers?.delete === 'function') {
        config.headers.delete('Content-Type');
        config.headers.delete('content-type');
      } else if (config.headers) {
        delete config.headers['Content-Type'];
        delete config.headers['content-type'];
      }
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
