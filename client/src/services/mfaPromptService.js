// Privileged endpoints (super admin, financial and support dashboards) answer
// 403 { code: 'MFA_REQUIRED' } until a fresh TOTP code is supplied. The axios
// interceptor asks for one here; <MfaCodeModal /> owns the UI. This mirrors
// RentalHubMobile/src/services/mfaPromptService.js so both clients behave the
// same way.

let pending = null;
let attempt = 0;
const listeners = new Set();

const emit = () => {
  const state = getMfaState();
  listeners.forEach((listener) => {
    try {
      listener(state);
    } catch (error) {
      // A listener error must never break the challenge flow.
    }
  });
};

export const getMfaState = () => {
  if (!pending) return { visible: false, attempt: 0, message: '' };
  return { visible: true, attempt: pending.attempt, message: pending.message };
};

export const subscribeMfaChallenge = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Resolves with the 6-digit code the user typed. Concurrent requests share one
// prompt (and one code), so parallel dashboard loads do not stack modals.
export const requestMfaCode = (message = '') => {
  if (pending) return pending.promise;

  attempt += 1;
  let resolveCode;
  let rejectCode;
  const promise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  pending = { promise, resolve: resolveCode, reject: rejectCode, attempt, message };
  emit();
  return promise;
};

export const submitMfaCode = (code) => {
  const current = pending;
  if (!current) return;
  pending = null;
  emit();
  current.resolve(String(code || '').trim());
};

export const cancelMfaChallenge = () => {
  const current = pending;
  if (!current) return;
  pending = null;
  attempt = 0;
  emit();
  current.reject(new Error('MFA_CHALLENGE_CANCELLED'));
};

// Called after a request that carried a code succeeded, so the next real
// challenge starts counting from a fresh prompt again.
export const resetMfaAttempts = () => {
  attempt = 0;
};
