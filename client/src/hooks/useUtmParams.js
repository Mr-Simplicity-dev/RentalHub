import { useEffect, useCallback } from 'react';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const STORAGE_KEY = 'rentalhub_utm';

export function captureUtmParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    let hasUtm = false;

    UTM_KEYS.forEach((key) => {
      const val = params.get(key);
      if (val) {
        utm[key] = val;
        hasUtm = true;
      }
    });

    if (hasUtm) {
      utm._captured_at = new Date().toISOString();
      utm._landing_page = window.location.pathname;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(utm));
    }
  } catch {
    // silently fail
  }
}

export function getStoredUtm() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearStoredUtm() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function useUtmParams() {
  useEffect(() => {
    captureUtmParams();
  }, []);

  const getUtm = useCallback(() => getStoredUtm(), []);

  return getUtm;
}
