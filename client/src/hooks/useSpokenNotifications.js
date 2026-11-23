import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

const DEVICE_KEY = 'rentalhub_spoken_device_id';
const INTERACTION_KEY = 'rentalhub_spoken_user_interacted';
const BROADCAST_NAME = 'rentalhub-spoken-notifications';
const POLL_MS = 30000;
const MAX_PLAY_QUEUE = 3;

const getDeviceId = () => {
  if (typeof window === 'undefined') return 'server';
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const id = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return `dev_${Date.now().toString(36)}`;
  }
};

const hasUserInteracted = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(INTERACTION_KEY) === '1';
  } catch {
    return false;
  }
};

const markUserInteracted = () => {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.setItem(INTERACTION_KEY, '1'); } catch {}
};

const canUseSpeechSynthesis = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';

const APPROVED_AUDIO = {
  // Approved recordings can be added here as /audio/spoken/<file>.mp3
};

const isExpired = (event) => {
  const expiresAt = event?.expiresAt ? new Date(event.expiresAt).getTime() : 0;
  return !expiresAt || expiresAt <= Date.now();
};

const pickEnglishVoice = () => {
  if (!canUseSpeechSynthesis()) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  return voices.find((v) => /en-ng|en-gb|en-us|english/i.test(`${v.lang} ${v.name}`)) || voices.find((v) => /^en/i.test(v.lang || '')) || null;
};

const result = (outcome, reason = null) => ({ outcome, reason });

export function useSpokenNotifications({ enabled, userId }) {
  const [interacted, setInteracted] = useState(hasUserInteracted());
  const deviceIdRef = useRef(getDeviceId());
  const busyRef = useRef(false);
  const seenAckRef = useRef(new Set());
  const sessionUnavailableRef = useRef(new Set());
  const mountedRef = useRef(true);
  const channelRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onInteract = () => {
      markUserInteracted();
      setInteracted(true);
    };
    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract);
    window.addEventListener('touchstart', onInteract, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
      window.removeEventListener('touchstart', onInteract);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel === 'undefined') return undefined;
    const ch = new BroadcastChannel(BROADCAST_NAME);
    channelRef.current = ch;
    ch.onmessage = (msg) => {
      const id = msg?.data?.ackEventId;
      if (id) seenAckRef.current.add(String(id));
    };
    return () => {
      ch.close();
      if (channelRef.current === ch) channelRef.current = null;
    };
  }, []);

  const announceAck = useCallback((eventId) => {
    const id = String(eventId);
    seenAckRef.current.add(id);
    try { channelRef.current?.postMessage({ ackEventId: id }); } catch {}
  }, []);

  const playAudioFile = useCallback((src) => new Promise((resolve) => {
    try {
      if (typeof Audio === 'undefined') return resolve(result('unavailable', 'audio_unsupported'));
      const audio = new Audio(src);
      let settled = false;
      const done = (outcome, reason = null) => { if (settled) return; settled = true; resolve(result(outcome, reason)); };
      audio.preload = 'auto';
      audio.onended = () => done('success');
      audio.onerror = () => done('unavailable', 'audio_unavailable');
      audio.onabort = () => done('interrupted', 'audio_aborted');
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch((err) => {
          const name = String(err?.name || '');
          if (name === 'NotAllowedError') return done('failed', 'autoplay_blocked');
          if (name === 'NotSupportedError') return done('unavailable', 'audio_unsupported');
          return done('failed', 'audio_play_failed');
        });
      }
    } catch {
      resolve(result('failed', 'audio_exception'));
    }
  }), []);

  const playSpeech = useCallback((text, language) => new Promise((resolve) => {
    const lang = String(language || 'en').toLowerCase();
    if (lang !== 'en') return resolve(result('unavailable', 'unsupported_language_voice'));
    if (!canUseSpeechSynthesis()) return resolve(result('unavailable', 'speech_synthesis_unavailable'));
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(String(text || '').slice(0, 280));
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang || 'en-NG';
      utterance.rate = 0.95;
      utterance.pitch = 1;
      let settled = false;
      const done = (outcome, reason = null) => { if (settled) return; settled = true; resolve(result(outcome, reason)); };
      utterance.onend = () => done('success');
      utterance.onerror = (e) => {
        const err = String(e?.error || '');
        if (err === 'interrupted' || err === 'canceled') return done('interrupted', 'speech_interrupted');
        if (err === 'not-allowed' || err === 'service-not-allowed') return done('failed', 'speech_not_allowed');
        return done('failed', 'speech_error');
      };
      window.speechSynthesis.speak(utterance);
      setTimeout(() => done('failed', 'speech_timeout'), 15000);
    } catch {
      resolve(result('failed', 'speech_exception'));
    }
  }), []);

  const playEvent = useCallback(async (event) => {
    if (isExpired(event)) return result('failed', 'expired');
    const audioSrc = event.audioKey ? APPROVED_AUDIO[event.audioKey] : null;
    if (audioSrc) {
      const audioResult = await playAudioFile(audioSrc);
      if (audioResult.outcome === 'success') return audioResult;
      // If approved audio exists but is unavailable/unsupported, do not fall back to invented voices.
      if (audioResult.outcome === 'unavailable') return audioResult;
      // Recoverable audio failure may fall through to English speech only for en.
    }
    return playSpeech(event.message, event.language);
  }, [playAudioFile, playSpeech]);

  const processPending = useCallback(async () => {
    if (!enabled || !userId || !interacted || busyRef.current || !mountedRef.current) return;
    busyRef.current = true;
    try {
      const res = await api.get('/notifications/spoken/pending', { params: { limit: MAX_PLAY_QUEUE } });
      const events = Array.isArray(res?.data?.data) ? res.data.data : [];
      for (const event of events) {
        if (!mountedRef.current || !enabled) break;
        const id = String(event.id);
        if (seenAckRef.current.has(id) || sessionUnavailableRef.current.has(id) || isExpired(event)) continue;

        let claimed = null;
        try {
          const claimRes = await api.post(`/notifications/spoken/${event.id}/claim`, { deviceId: deviceIdRef.current });
          claimed = claimRes?.data?.data;
        } catch {
          continue; // another tab/device claimed it, not eligible, or expired
        }
        if (!claimed) continue;

        const playback = await playEvent(event);

        if (playback.outcome === 'success') {
          try {
            await api.post(`/notifications/spoken/${event.id}/ack`, {
              deviceId: deviceIdRef.current,
              outcome: 'success',
            });
            announceAck(id);
          } catch {
            // Ack failed; server claim expiry/retry rules allow recovery.
          }
          continue;
        }

        // Failed/interrupted/unavailable: do NOT acknowledge success, do NOT mark in-app notification read.
        try {
          await api.post(`/notifications/spoken/${event.id}/ack`, {
            deviceId: deviceIdRef.current,
            outcome: playback.outcome || 'failed',
            reason: playback.reason || 'playback_failed',
          });
        } catch {
          // Server will allow retry after claim expiry/eligibility.
        }

        if (playback.outcome === 'unavailable' || playback.outcome === 'unsupported') {
          sessionUnavailableRef.current.add(id); // no endless retry for unavailable audio in-session
        }
        // Recoverable failures are not added to seenAckRef; server next_eligible_at bounds retries.
      }
    } catch {
      // silent - visual notifications remain source of truth
    } finally {
      busyRef.current = false;
    }
  }, [announceAck, enabled, interacted, playEvent, userId]);

  useEffect(() => {
    if (!enabled || !userId) return undefined;
    processPending();
    const interval = window.setInterval(processPending, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') processPending(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, processPending, userId]);

  return { interacted, deviceId: deviceIdRef.current };
}
