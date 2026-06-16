import axios from 'axios';
import { clearAuthSession, getAuthToken, setAuthToken } from './authStorage';

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

// Track if a refresh is already in-flight to avoid multiple simultaneous calls
let isRefreshing = false;
let pendingRequests = [];

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

// Response interceptor with silent token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401 and if we haven't already retried
    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    // Don't try to refresh if the failing request was itself the refresh endpoint
    if (originalRequest?.url?.includes('/auth/refresh-token')) {
      clearAuthSession();
      delete api.defaults.headers.common.Authorization;
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // Queue this request until the refresh completes
      return new Promise((resolve) => {
        pendingRequests.push((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(api(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(
        `${API_BASE_URL}/auth/refresh-token`,
        {},
        { withCredentials: true }
      );

      if (data.success && data.data?.token) {
        setAuthToken(data.data.token);
        api.defaults.headers.common.Authorization = `Bearer ${data.data.token}`;

        // Replay queued requests
        pendingRequests.forEach((cb) => cb(data.data.token));
        pendingRequests = [];

        // Retry the original request
        originalRequest.headers.Authorization = `Bearer ${data.data.token}`;
        return api(originalRequest);
      }
    } catch (_) {
      // Refresh failed — clear session
    }

    isRefreshing = false;
    pendingRequests = [];
    clearAuthSession();
    delete api.defaults.headers.common.Authorization;
    return Promise.reject(error);
  }
);

export default api;
