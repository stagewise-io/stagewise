/**
 * Global Turnstile solver for cross-context token acquisition.
 *
 * The renderer (Electron UI) can successfully load and solve Cloudflare
 * Turnstile challenges. Web pages loaded in Electron's webContents (e.g.
 * console.stagewise.io) cannot, because Turnstile's fingerprinting rejects
 * Electron's webContents environment.
 *
 * This module registers `window.__solveTurnstile()` so the main process can
 * call it via `webContents.executeJavaScript('window.__solveTurnstile()')` and
 * relay the resulting token back to the requesting webContents through IPC.
 */

const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '';

declare global {
  interface Window {
    __solveTurnstile?: () => Promise<string | null>;
  }
}

/** Ensure the Turnstile script is loaded, resolving once `window.turnstile` exists. */
function ensureTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${TURNSTILE_SCRIPT_URL}"]`,
    );
    if (existing) {
      if (window.turnstile) {
        resolve();
      } else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Turnstile script failed to load')),
          { once: true },
        );
      }
      return;
    }

    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script failed to load'));
    document.head.appendChild(script);
  });
}

/** Concurrency guard — only one challenge at a time. */
let pendingSolve: Promise<string | null> | null = null;

/**
 * Solve a single Turnstile challenge and return the token.
 * Creates a temporary off-screen container, renders the widget, waits for
 * the callback, then cleans up.
 *
 * Concurrent calls are coalesced — all callers receive the same token.
 */
async function solveTurnstile(): Promise<string | null> {
  if (pendingSolve) return pendingSolve;
  pendingSolve = doSolve().finally(() => {
    pendingSolve = null;
  });
  return pendingSolve;
}

async function doSolve(): Promise<string | null> {
  if (!TURNSTILE_SITE_KEY) return null;

  try {
    await ensureTurnstileScript();
  } catch {
    return null;
  }

  if (!window.turnstile) return null;

  return new Promise<string | null>((resolve) => {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '16px';
    container.style.right = '16px';
    container.style.zIndex = '2147483647';
    container.style.overflow = 'visible';
    document.body.appendChild(container);

    let widgetId: string | null = null;
    let settled = false;

    const cleanup = () => {
      if (widgetId && window.turnstile) {
        try {
          window.turnstile.remove(widgetId);
        } catch {}
      }
      container.remove();
    };

    const settle = (token: string | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(token);
    };

    // Safety timeout — don't hang forever
    const timeout = setTimeout(() => settle(null), 30_000);

    try {
      widgetId = window.turnstile!.render(container, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          clearTimeout(timeout);
          settle(token);
        },
        'expired-callback': () => {
          clearTimeout(timeout);
          settle(null);
        },
        'error-callback': () => {
          clearTimeout(timeout);
          settle(null);
        },
        appearance: 'interaction-only',
        size: 'compact',
      });
    } catch {
      clearTimeout(timeout);
      settle(null);
    }
  });
}

// Register globally so the main process can call it via executeJavaScript
window.__solveTurnstile = solveTurnstile;
