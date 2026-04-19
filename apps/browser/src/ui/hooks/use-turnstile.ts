import { useState, useCallback, useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          appearance?: 'interaction-only' | 'always' | 'execute';
          size?: 'normal' | 'compact' | 'flexible';
        },
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

/**
 * Loads the Cloudflare Turnstile widget and manages its lifecycle.
 * Returns a ref for the hidden container, the current token, readiness
 * state, and a reset function.
 *
 * When `VITE_TURNSTILE_SITE_KEY` is not set, the hook is inert —
 * `enabled` is false and `token` stays null.
 */
export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const widgetIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const enabled = !!TURNSTILE_SITE_KEY;

  const initWidget = useCallback(() => {
    if (!window.turnstile || !containerRef.current) return;
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {}
      widgetIdRef.current = null;
    }
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (t: string) => {
          setToken(t);
          setError(false);
        },
        'expired-callback': () => setToken(null),
        'error-callback': () => {
          setToken(null);
          setError(true);
        },
        appearance: 'interaction-only',
        size: 'flexible',
      });
      setReady(true);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let raf: number | undefined;
    let existingScript: Element | null = null;
    const onLoad = () => initWidget();
    const onError = () => setError(true);

    const tryInit = () => {
      if (window.turnstile && containerRef.current) {
        initWidget();
        return true;
      }
      return false;
    };

    // If already loaded, try immediately; if ref not ready, retry on next frame
    if (window.turnstile) {
      if (!tryInit()) {
        raf = requestAnimationFrame(() => tryInit());
      }
    } else {
      // Avoid duplicate script tags (React Strict Mode double-fires effects)
      existingScript = document.querySelector(
        `script[src="${TURNSTILE_SCRIPT_URL}"]`,
      );
      if (existingScript) {
        // Script already in DOM — wait for it to load
        if (window.turnstile) {
          initWidget();
        } else {
          existingScript.addEventListener('load', onLoad, { once: true });
          existingScript.addEventListener('error', onError, { once: true });
        }
      } else {
        const script = document.createElement('script');
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.onload = onLoad;
        script.onerror = onError;
        document.head.appendChild(script);
      }
    }

    return () => {
      if (raf !== undefined) cancelAnimationFrame(raf);
      if (existingScript) {
        existingScript.removeEventListener('load', onLoad);
        existingScript.removeEventListener('error', onError);
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [enabled, initWidget]);

  const reset = useCallback(() => {
    setToken(null);
    setError(false);
    if (widgetIdRef.current && window.turnstile) {
      window.turnstile.reset(widgetIdRef.current);
    }
  }, []);

  return { containerRef, token, ready, error, enabled, reset };
}
