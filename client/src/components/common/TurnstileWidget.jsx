import React, { useEffect, useRef } from 'react';

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const TurnstileWidget = ({ onToken, onExpire, onError }) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);
  const callbacksRef = useRef({ onToken, onExpire, onError });
  callbacksRef.current = { onToken, onExpire, onError };

  useEffect(() => {
    if (!SITE_KEY || !containerRef.current) return;

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
      if (widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
        widgetIdRef.current = null;
      }
      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          callback: (token) => callbacksRef.current.onToken?.(token),
          'expired-callback': () => {
            widgetIdRef.current = null;
            callbacksRef.current.onExpire?.();
          },
          'error-callback': () => {
            widgetIdRef.current = null;
            callbacksRef.current.onError?.();
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
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
};

export default TurnstileWidget;
