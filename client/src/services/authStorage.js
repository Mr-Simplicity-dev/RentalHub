const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const IMPERSONATION_ORIGINAL_TOKEN_KEY = 'impersonation_original_token';
const IMPERSONATION_ORIGINAL_USER_KEY = 'impersonation_original_user';

// In-memory token — survives page navigation but NOT page refresh.
// On refresh, the HTTP-only cookie (7d session token) is used to mint a new one
// via GET /auth/me or POST /auth/refresh-token.
let _accessToken = null;

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const setAuthSession = (token, user) => {
  _accessToken = token;
  const session = getSessionStorage();
  const local = getLocalStorage();

  if (session) {
    session.setItem(USER_KEY, JSON.stringify(user));
  }

  // Clear global auth keys so each tab can maintain its own account session.
  if (local) {
    local.removeItem(USER_KEY);
  }
};

export const setAuthToken = (token) => {
  _accessToken = token;
};

export const clearAuthSession = () => {
  _accessToken = null;
  const session = getSessionStorage();
  const local = getLocalStorage();

  if (session) {
    session.removeItem(USER_KEY);
    // Never leave a stored original admin session behind on logout.
    session.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
    session.removeItem(IMPERSONATION_ORIGINAL_USER_KEY);
  }

  // Backward compatibility cleanup for old global auth storage.
  if (local) {
    local.removeItem(USER_KEY);
    localStorage.removeItem('lawyer_accepted_dismissed');
  }
};

export const getAuthToken = () => {
  if (_accessToken) return _accessToken;

  // Fallback: check sessionStorage for legacy tokens (one-time migration)
  const session = getSessionStorage();
  const legacyToken = session?.getItem(TOKEN_KEY);
  if (legacyToken) {
    _accessToken = legacyToken;
    session.removeItem(TOKEN_KEY);
    return _accessToken;
  }

  return null;
};

const KNOWN_USER_TYPES = new Set([
  'landlord', 'tenant', 'admin', 'super_admin', 'lawyer', 'state_lawyer', 'super_lawyer',
  'state_admin', 'state_financial_admin', 'state_support_admin', 'lga_admin',
  'lga_support_admin', 'super_financial_admin', 'super_support_admin',
  'zonal_admin', 'transportation_admin', 'lga_transportation_admin',
  'state_transportation_admin', 'super_transportation_admin',
  'fumigation_admin', 'lga_fumigation_admin', 'state_fumigation_admin',
  'super_fumigation_admin', 'financial_admin', 'support_admin', 'recruitment_admin',
]);

const isValidStoredUser = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!value.id && !Number.isInteger(Number(value.id))) return false;
  if (typeof value.email !== 'string' || !value.email.includes('@')) return false;
  if (!KNOWN_USER_TYPES.has(value.user_type)) return false;
  return true;
};

export const getAuthUser = () => {
  const session = getSessionStorage();
  const local = getLocalStorage();

  const sessionUser = session?.getItem(USER_KEY);
  if (sessionUser) {
    try {
      const parsed = JSON.parse(sessionUser);
      return isValidStoredUser(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const legacyUser = local?.getItem(USER_KEY);
  if (legacyUser && session) {
    session.setItem(USER_KEY, legacyUser);
    local.removeItem(USER_KEY);
  }

  if (!legacyUser) return null;

  try {
    const parsed = JSON.parse(legacyUser);
    return isValidStoredUser(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const setAuthUser = (user) => {
  const session = getSessionStorage();
  const local = getLocalStorage();
  const payload = JSON.stringify(user);

  if (session) {
    session.setItem(USER_KEY, payload);
  }

  if (local) {
    local.removeItem(USER_KEY);
  }
};

export const setImpersonationOriginalSession = (token, user) => {
  const session = getSessionStorage();
  if (!session || !token || !user) return;

  session.setItem(IMPERSONATION_ORIGINAL_TOKEN_KEY, String(token));
  session.setItem(IMPERSONATION_ORIGINAL_USER_KEY, JSON.stringify(user));
};

export const getImpersonationOriginalSession = () => {
  const session = getSessionStorage();
  if (!session) return null;

  const token = session.getItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
  const rawUser = session.getItem(IMPERSONATION_ORIGINAL_USER_KEY);
  if (!token || !rawUser) return null;

  try {
    return { token, user: JSON.parse(rawUser) };
  } catch {
    return null;
  }
};

export const clearImpersonationOriginalSession = () => {
  const session = getSessionStorage();
  if (!session) return;

  session.removeItem(IMPERSONATION_ORIGINAL_TOKEN_KEY);
  session.removeItem(IMPERSONATION_ORIGINAL_USER_KEY);
};

export const isImpersonatingSession = () => {
  return Boolean(getImpersonationOriginalSession());
};
