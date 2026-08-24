import React, { useEffect, useState } from 'react';
import { FaDownload, FaMobileAlt, FaTimes } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';

const DISMISS_DAYS = 7;
const DISMISS_KEY = 'rentalhub_install_banner_dismissed';

const isAndroid = () =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');

const InstallAppBanner = ({ disabled = false }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (disabled || typeof window === 'undefined') return undefined;
    if (!isAndroid()) return undefined;

    const dismissedRaw = window.localStorage.getItem(DISMISS_KEY);
    if (dismissedRaw) {
      const timestamp = Number(dismissedRaw);
      if (Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_DAYS * 24 * 60 * 60 * 1000) {
        return undefined;
      }
      window.localStorage.removeItem(DISMISS_KEY);
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setVisible(true);
    };

    const handleInstalled = () => setVisible(false);

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [disabled]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const handleInstall = () => {
    setStarting(true);
    const anchor = document.createElement('a');
    anchor.href = '/api/downloads/app';
    anchor.download = 'RentalHub.apk';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => dismiss(), 400);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] px-3 pb-3 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[380px] sm:px-0 sm:pb-0">
      <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
          <FaMobileAlt className="text-xl" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-700">
            {t('install_prompt.eyebrow')}
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900">{t('install_prompt.title')}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">{t('install_prompt.subtitle')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleInstall}
              disabled={starting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <FaDownload className="text-xs" />
              {starting ? t('install_prompt.downloading') : t('install_prompt.install')}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {t('install_prompt.not_now')}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <FaTimes />
        </button>
      </div>
    </div>
  );
};

export default InstallAppBanner;
