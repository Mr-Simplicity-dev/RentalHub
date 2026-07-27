import React, { useEffect, useRef } from 'react';

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

const TurnstileWidget = ({ onToken, onExpire, onError }) => {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

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
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: (token) => onToken?.(token),
        'expired-callback': () => {
          widgetIdRef.current = null;
          onExpire?.();
        },
        'error-callback': () => {
          widgetIdRef.current = null;
          onError?.();
        },
      });
    };

    const checkLoaded = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkLoaded);
        renderWidget();
      }
    }, 100);

    return () => {
      clearInterval(checkLoaded);
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [onToken, onExpire, onError]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
};

export default TurnstileWidget;
