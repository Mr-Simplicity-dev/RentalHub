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
    if (config.skipAuth && typeof config.headers?.delete === 'function') {
      config.headers.delete('Authorization');
    } else if (config.skipAuth && config.headers) {
      delete config.headers.Authorization;
      delete config.headers.authorization;
    } else if (token) {
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

    if (originalRequest?.skipAuthRefresh) {
      return Promise.reject(error);
    }

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
  const newToken = data.data.token;

  setAuthToken(newToken);

  api.defaults.headers.common.Authorization =
    `Bearer ${newToken}`;

  // Release the refresh lock before replaying queued requests.
  isRefreshing = false;

  const queuedRequests = pendingRequests;
  pendingRequests = [];

  queuedRequests.forEach((callback) => {
    callback(newToken);
  });

  // Retry the original request with the refreshed token.
  originalRequest.headers =
    originalRequest.headers || {};

  originalRequest.headers.Authorization =
    `Bearer ${newToken}`;

  return api(originalRequest);
}

throw new Error(
  data?.message || 'Authentication token refresh failed'
);
} catch (refreshError) {
  // Refresh failed — clear the session and release pending requests.
  isRefreshing = false;
  pendingRequests = [];

  clearAuthSession();

  delete api.defaults.headers.common.Authorization;

  return Promise.reject(refreshError);
}
    

    isRefreshing = false;
    pendingRequests = [];
    clearAuthSession();
    delete api.defaults.headers.common.Authorization;
    return Promise.reject(error);
  }
);

export default api;
