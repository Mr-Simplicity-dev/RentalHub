import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaShieldAlt, FaTimes } from 'react-icons/fa';
import {
  cancelMfaChallenge,
  getMfaState,
  submitMfaCode,
  subscribeMfaChallenge,
} from '../../services/mfaPromptService';

// Shown when the server answers 403 MFA_REQUIRED: privileged dashboards need a
// fresh 6-digit TOTP code before they will hand over data. Without this the
// web dashboards simply look broken after a successful login.
export default function MfaCodeModal() {
  const { t } = useTranslation();
  const [challenge, setChallenge] = useState(getMfaState());
  const [code, setCode] = useState('');

  useEffect(() => subscribeMfaChallenge(setChallenge), []);

  useEffect(() => {
    if (!challenge.visible) {
      setCode('');
    }
  }, [challenge.visible]);

  if (!challenge.visible) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const value = code.trim();
    if (value.length !== 6) return;
    submitMfaCode(value);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <FaShieldAlt className="text-xl" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {t('mfa_challenge.title', 'Two-factor check')}
              </h3>
              <p className="text-xs text-gray-500">
                {t('mfa_challenge.subtitle', 'This screen is protected by two-factor authentication.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cancelMfaChallenge}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label={t('mfa_challenge.close', 'Close')}
          >
            <FaTimes className="text-xl" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <p className="text-sm text-gray-600">
            {t(
              'mfa_challenge.body',
              'Enter the 6-digit code from your authenticator app (e.g. Google Authenticator) to unlock this screen.'
            )}
          </p>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            autoFocus
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />

          {challenge.attempt > 1 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {challenge.message ||
                t(
                  'mfa_challenge.retry',
                  'That code was not accepted. Codes change every 30 seconds, so try the next one.'
                )}
            </p>
          )}

          <button
            type="submit"
            disabled={code.length !== 6}
            className="block w-full rounded-xl bg-indigo-600 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {t('mfa_challenge.unlock', 'Unlock')}
          </button>

          <button
            type="button"
            onClick={cancelMfaChallenge}
            className="block w-full py-2 text-center text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            {t('mfa_challenge.cancel', 'Not now')}
          </button>
        </form>
      </div>
    </div>
  );
}
