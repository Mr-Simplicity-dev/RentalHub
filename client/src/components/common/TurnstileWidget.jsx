import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const TurnstileWidget = forwardRef(({ action, onToken, onExpire, onError }, ref) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onToken, onExpire, onError });
  callbacksRef.current = { onToken, onExpire, onError };

  useImperativeHandle(ref, () => ({
    reset() {
      if (window.turnstile && widgetIdRef.current !== null) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }), []);

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;
    // The server rejects tokens whose action does not match the protected
    // route, so every form must declare its own action.
    if (!action) {
      console.error('TurnstileWidget requires an "action" prop (e.g. action="rentalhub_login"). Tokens without a matching action will be rejected by the server.');
      return;
    }

    const id = 'cf-turnstile-script';
    if (!document.getElementById(id)) {
      const script = document.createElement('script');
      script.id = id;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current !== null) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          action,
          appearance: 'interaction-only',
          execution: 'render',
          theme: 'auto',
          retry: 'auto',
          refreshExpired: 'auto',
          callback: (token) => callbacksRef.current.onToken?.(token),
          'expired-callback': () => {
            callbacksRef.current.onExpire?.();
          },
          'error-callback': (errorCode) => {
            callbacksRef.current.onError?.(errorCode);
            return true;
          },
        });
      } catch {}
    };

    if (window.turnstile) {
      renderWidget();
      return;
    }

    const checkLoaded = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkLoaded);
        renderWidget();
      }
    }, 100);

    return () => {
      clearInterval(checkLoaded);
      if (widgetIdRef.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
    };
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
});

TurnstileWidget.displayName = 'TurnstileWidget';

export default TurnstileWidget;
