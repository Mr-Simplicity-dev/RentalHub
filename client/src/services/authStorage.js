const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const IMPERSONATION_ORIGINAL_TOKEN_KEY = 'impersonation_original_token';
const IMPERSONATION_ORIGINAL_USER_KEY = 'impersonation_original_user';

const getSessionStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
};

const getLocalStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

export const setAuthSession = (token, user) => {
  const session = getSessionStorage();
  const local = getLocalStorage();

  if (session) {
    session.setItem(TOKEN_KEY, token);
    session.setItem(USER_KEY, JSON.stringify(user));
  }

  // Clear global auth keys so each tab can maintain its own account session.
  if (local) {
    local.removeItem(TOKEN_KEY);
    local.removeItem(USER_KEY);
  }
};

export const clearAuthSession = () => {
  const session = getSessionStorage();
  const local = getLocalStorage();

  if (session) {
    session.removeItem(TOKEN_KEY);
    session.removeItem(USER_KEY);
  }

  // Backward compatibility cleanup for old global auth storage.
  if (local) {
    local.removeItem(TOKEN_KEY);
    local.removeItem(USER_KEY);
  }
};

export const getAuthToken = () => {
  const session = getSessionStorage();
  const local = getLocalStorage();

  const sessionToken = session?.getItem(TOKEN_KEY);
  if (sessionToken) return sessionToken;

  // One-time migration path for old sessions stored in localStorage.
  const legacyToken = local?.getItem(TOKEN_KEY);
  if (legacyToken && session) {
    session.setItem(TOKEN_KEY, legacyToken);
    local.removeItem(TOKEN_KEY);
  }

  return legacyToken || null;
};

export const getAuthUser = () => {
  const session = getSessionStorage();
  const local = getLocalStorage();

  const sessionUser = session?.getItem(USER_KEY);
  if (sessionUser) {
    try {
      return JSON.parse(sessionUser);
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
    return JSON.parse(legacyUser);
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
