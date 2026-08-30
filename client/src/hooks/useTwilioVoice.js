// ─────────────────────────────────────────────────────────────────────────────
// useTwilioVoice — manages the Twilio Voice JS SDK Device lifecycle for the
// Super Support "Voice Desk".
//
// Lifecycle rules:
//   - Nothing is fetched or initialized until the agent clicks "Go Available".
//   - Token refresh happens automatically before expiry (tokenWillExpire).
//   - The Device is destroyed (unregister + remove all listeners) when the
//     agent goes unavailable, the component unmounts, or the admin logs out.
//
// Security:
//   - JWTs / Twilio tokens are NEVER logged or stored anywhere beyond the SDK.
//   - The SDK is created with logLevel: 0 so it does not print tokens.
//   - Friendly, safe error messages are derived from SDK error codes only.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { Device } from '@twilio/voice-sdk';
import { useAuth } from './useAuth';
import { fetchVoiceToken } from '../services/voiceApi';

const AGENT_IDENTITY = 'support_agent_1';
const TOKEN_REFRESH_LEAD_MS = 60 * 1000; // refresh ~1 min before expiry

// Friendly recovery hints keyed by SDK error code (codes 31xxx = WebRTC,
// 32xxx = transport, 33xxx = registration, 20xxx = signaling).
const ERROR_HINTS = {
  31005: 'Microphone access was denied. Allow microphone permission for this site, then try again.',
  31007: 'Microphone permission is required to receive calls. Enable it in your browser settings, then try again.',
  32002: 'Could not reach the Twilio service. Check your connection and try again.',
  33001: 'Registration with the voice service failed. Try again in a moment.',
  33002: 'The voice session expired. Go unavailable and come back to refresh it.',
};

const friendlyError = (error) => {
  if (!error) return 'An unexpected voice error occurred.';
  const code = typeof error.code === 'number' ? error.code : Number(error.code);
  if (code && ERROR_HINTS[code]) return ERROR_HINTS[code];
  if (error.message && !/jwt|token/i.test(error.message)) {
    // Never surface a raw SDK message that could contain credentials.
    return String(error.message).slice(0, 160);
  }
  return 'An unexpected voice error occurred.';
};

const useTwilioVoice = () => {
  const { user, isAuthenticated } = useAuth();

  const [status, setStatus] = useState('offline'); // offline|connecting|ready|reconnecting|error
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(null);

  const deviceRef = useRef(null);
  const incomingRef = useRef(null);
  const activeCallRef = useRef(null);
  const queueCallRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  const [inQueue, setInQueue] = useState(false);
  const queueNameRef = useRef(process.env.REACT_APP_VOICE_QUEUE_NAME || 'support');

  const isQueueCall = (call) =>
    String(call?.parameters?.To || call?.customParameters?.To || '').toLowerCase().startsWith('queue:');

  const syncRefs = () => {
    incomingRef.current = incomingCall;
    activeCallRef.current = activeCall;
  };
  useEffect(syncRefs, [incomingCall, activeCall]);

  const teardown = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (deviceRef.current) {
      try {
        deviceRef.current.removeAllListeners();
        deviceRef.current.destroy();
      } catch {
        // Device already gone — nothing else to clean up.
      }
      deviceRef.current = null;
    }
    if (incomingRef.current) {
      try { incomingRef.current.reject(); } catch { /* already ended */ }
    }
    incomingRef.current = null;
    if (queueCallRef.current) {
      try { queueCallRef.current.disconnect(); } catch { /* already ended */ }
    }
    queueCallRef.current = null;
    if (activeCallRef.current) {
      try { activeCallRef.current.disconnect(); } catch { /* already ended */ }
    }
    activeCallRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
    setInQueue(false);
    setMuted(false);
  }, []);

  const goUnavailable = useCallback(() => {
    teardown();
    setStatus('offline');
    setError(null);
  }, [teardown]);

  const refreshToken = useCallback(async () => {
    if (!deviceRef.current) return;
    try {
      const token = await fetchVoiceToken();
      deviceRef.current.updateToken(token);
    } catch {
      // Refresh failure is non-fatal while the current token is still valid.
      setStatus((prev) => (prev === 'ready' ? 'ready' : prev));
    }
  }, []);

  // Dial the queue through the TwiML App. The backend serves the agent-side
  // Dequeue TwiML (a <Dial><Queue> leg) when To starts with "queue:".
  const connectToQueue = useCallback(() => {
    const device = deviceRef.current;
    if (!device || queueCallRef.current) return;
    setError(null);
    try {
      const queueCall = device.connect({ To: `queue:${queueNameRef.current}` });
      queueCallRef.current = queueCall;

      const clearQueueCall = () => {
        if (queueCallRef.current === queueCall) {
          queueCallRef.current = null;
          setInQueue(false);
          // While the agent stays available, put them back on the line so the
          // next queued caller can be bridged.
          if (deviceRef.current && statusRef.current === 'ready' && !reconnectTimerRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              reconnectTimerRef.current = null;
              if (deviceRef.current && statusRef.current === 'ready') connectToQueue();
            }, 2000);
          }
        }
      };
      queueCall.once('disconnect', clearQueueCall);
      queueCall.once('cancel', clearQueueCall);
      setInQueue(true);
    } catch (queueError) {
      setError('Could not join the support queue. Try again.');
    }
  }, []);

  const goAvailable = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    try {
      const token = await fetchVoiceToken();

      const device = new Device(token, {
        logLevel: 0,
        codecPreferences: ['opus', 'pcmu'],
      });
      deviceRef.current = device;

      device.on('registered', () => {
        setStatus('ready');
        setError(null);
        // Registration is the first half of going on duty; joining the queue
        // line is the second. The backend bridges queued callers onto this leg.
        connectToQueue();
      });

      device.on('unregistered', () => {
        // Only reflect "offline" when the agent intentionally unregistered;
        // transient transport issues surface as 'error'/'reconnecting' instead.
        if (statusRef.current === 'ready') setStatus('offline');
      });

      device.on('reconnecting', () => setStatus('reconnecting'));
      device.on('reconnected', () => setStatus('ready'));

      device.on('error', (deviceError) => {
        const message = friendlyError(deviceError);
        setError(message);
        setStatus('error');
        // Registration failures (e.g. mic denied) leave the device unusable.
        if (deviceError && [31005, 31007, 33001, 33002].includes(Number(deviceError.code))) {
          teardown();
        }
      });

      device.on('incoming', (call) => {
        incomingRef.current = call;
        setIncomingCall(call);

        call.once('accept', () => {
          incomingRef.current = null;
          setIncomingCall(null);
          activeCallRef.current = call;
          setActiveCall(call);
          setMuted(false);
        });

        const clearIncoming = () => {
          if (incomingRef.current === call) {
            incomingRef.current = null;
            setIncomingCall(null);
          }
        };
        call.once('cancel', clearIncoming);
        call.once('reject', clearIncoming);
        call.once('disconnect', () => {
          clearIncoming();
          if (activeCallRef.current === call) {
            activeCallRef.current = null;
            setActiveCall(null);
            setMuted(false);
          }
        });
      });

      device.on('tokenWillExpire', () => {
        // Schedule refresh shortly before expiry so the agent stays reachable.
        refreshTimerRef.current = setTimeout(() => {
          refreshToken();
        }, TOKEN_REFRESH_LEAD_MS);
      });

      device.on('connect', (call) => {
        setStatus('ready');
        // The queue line (and any bridged caller) surfaces as the active call.
        if (call && !activeCallRef.current) {
          activeCallRef.current = call;
          setActiveCall(call);
        }
      });
      device.on('disconnect', (call) => {
        if (activeCallRef.current === call) {
          activeCallRef.current = null;
          setActiveCall(null);
          setMuted(false);
        }
      });

      await device.register();
    } catch (fetchOrDeviceError) {
      if (fetchOrDeviceError?.code === 'VOICE_AUTH_ERROR') {
        setError('Your admin session is not valid for the voice service. Refresh the page and try again.');
      } else if (fetchOrDeviceError?.code === 'VOICE_NETWORK_ERROR') {
        setError('Could not reach the voice service. Check your connection and try again.');
      } else if (fetchOrDeviceError?.message) {
        setError(friendlyError(fetchOrDeviceError));
      } else {
        setError('Could not connect to the voice service. Try again.');
      }
      setStatus('error');
      teardown();
    }
  }, [connectToQueue, refreshToken, teardown]);

  // Cleanup when the component unmounts or the admin logs out.
  const isLoggedOut = !isAuthenticated || !user;
  useEffect(() => {
    if (isLoggedOut && deviceRef.current) {
      teardown();
      setStatus('offline');
      setError(null);
    }
  }, [isLoggedOut, teardown]);

  // Refresh the token on a fixed cadence while ready, as a safety net for
  // missed tokenWillExpire events. 55 min < 60 min TTL.
  useEffect(() => {
    if (status !== 'ready' || !deviceRef.current) return undefined;
    const interval = setInterval(() => refreshToken(), 55 * 60 * 1000);
    return () => clearInterval(interval);
  }, [status, refreshToken]);

  useEffect(() => () => teardown(), [teardown]);

  const answerCall = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    try {
      call.accept();
    } catch (callError) {
      setError('Could not answer the call. Try again.');
    }
  }, []);

  const declineCall = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    try {
      call.reject();
    } catch {
      // The call may have already ended — clear UI state regardless.
    }
    incomingRef.current = null;
    setIncomingCall(null);
  }, []);

  const endCall = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    try {
      call.disconnect();
    } catch {
      // Already disconnected — clear UI state regardless.
    }
    activeCallRef.current = null;
    setActiveCall(null);
    setMuted(false);
  }, []);

  const toggleMute = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) return;
    try {
      const next = !call.isMuted();
      call.mute(next);
      setMuted(next);
    } catch {
      setError('Could not change the microphone mute state.');
    }
  }, []);

  return {
    status,
    incomingCall,
    activeCall,
    inQueue,
    muted,
    error,
    goAvailable,
    goUnavailable,
    connectToQueue,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    identity: AGENT_IDENTITY,
  };
};

export default useTwilioVoice;
