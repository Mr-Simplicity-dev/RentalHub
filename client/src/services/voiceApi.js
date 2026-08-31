// ─────────────────────────────────────────────────────────────────────────────
// Twilio Voice API client.
//
// IMPORTANT: the backend voice-token endpoint lives at GET /voice/token —
// NOT /api/voice/token. The shared Axios client (client/src/services/api.js)
// hard-codes base URL `/api`, so this module deliberately uses fetch with an
// absolute path so no `/api` prefix can sneak in.
//
// The endpoint is protected by the backend `authenticate` middleware, which
// reads the same Bearer JWT that authStorage manages. We reuse getAuthToken()
// from authStorage — no second token storage is created here. `credentials:
// "include"` keeps the session cookie flow working (refresh/CSRF infra).
// Tokens are never logged or stored by this module.
// ─────────────────────────────────────────────────────────────────────────────

import { getAuthToken } from './authStorage';

export const fetchVoiceToken = async () => {
  const token = getAuthToken();

  let response;
  try {
    response = await fetch('/voice/token', {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkError) {
    const error = new Error(
      'Could not reach the voice service. Check your connection and try again.'
    );
    error.code = 'VOICE_NETWORK_ERROR';
    throw error;
  }

  if (!response.ok) {
    let message = 'The voice service is unavailable.';
    try {
      const data = await response.json();
      if (data?.message) message = data.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    const error = new Error(message);
    error.code =
      response.status === 401 || response.status === 403
        ? 'VOICE_AUTH_ERROR'
        : 'VOICE_TOKEN_ERROR';
    error.status = response.status;
    throw error;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    const error = new Error('Voice service returned an unreadable response.');
    error.code = 'VOICE_TOKEN_ERROR';
    throw error;
  }

  if (!data?.token) {
    const error = new Error('Voice service did not return a token.');
    error.code = 'VOICE_TOKEN_ERROR';
    throw error;
  }

  return data.token;
};

const authedFetch = async (path, options = {}) => {
  const token = getAuthToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  let response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch (networkError) {
    const error = new Error('Could not reach the voice service. Check your connection.');
    error.code = 'VOICE_NETWORK_ERROR';
    throw error;
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body — fall through to the status check below.
  }

  if (!response.ok) {
    const error = new Error(data?.message || 'The voice service request failed.');
    error.status = response.status;
    error.code = response.status === 401 || response.status === 403
      ? 'VOICE_AUTH_ERROR'
      : 'VOICE_REQUEST_ERROR';
    throw error;
  }

  return data;
};

/** Admin-only list of escalation department names (targets stay on the backend). */
export const fetchDepartments = async () => {
  const data = await authedFetch('/voice/departments');
  return Array.isArray(data?.data) ? data.data : [];
};

/**
 * Warm-transfer consult: the department is called into the caller's room and
 * held+coached so ONLY the agent hears them (the caller is parked on hold).
 * Returns { connected } — false when the department hasn't answered yet.
 */
export const consultCall = async (callSid, department) => {
  if (!callSid || !department) {
    const error = new Error('Missing call or department for consultation.');
    error.code = 'VOICE_REQUEST_ERROR';
    throw error;
  }
  const data = await authedFetch('/voice/escalate', {
    method: 'POST',
    body: JSON.stringify({ action: 'consult', callSid, department }),
  });
  return data?.data?.connected === true;
};

/**
 * Warm-transfer bridge: unholds the department and the caller (three-way),
 * after which the agent hangs up on their side.
 */
export const transferCall = async (callSid) => {
  if (!callSid) {
    const error = new Error('Missing call for transfer.');
    error.code = 'VOICE_REQUEST_ERROR';
    throw error;
  }
  return authedFetch('/voice/escalate', {
    method: 'POST',
    body: JSON.stringify({ action: 'transfer', callSid }),
  });
};
