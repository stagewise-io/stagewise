/**
 * This file will automatically be loaded by vite and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.ts` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import posthog from 'posthog-js';
import '@ui/app.css';
import { App } from '@ui/app';
import { initThemeColorSync } from '@ui/utils/theme-color-sync';

// Register global Turnstile solver for cross-context token proxy.
// Must live in the UI renderer (not pages) because vite.ui.config.ts
// has envDir set to read VITE_TURNSTILE_SITE_KEY from apps/browser/.env.
import '@ui/services/turnstile-solver';

// Global safety net: capture unhandled errors and rejections to PostHog
window.addEventListener('error', (event) => {
  posthog.captureException(event.error ?? event, {
    source: 'renderer',
    handler: 'globalOnError',
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const error =
    event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
  posthog.captureException(error, {
    source: 'renderer',
    handler: 'unhandledRejection',
  });
});

// Initialize theme color sync for dev mode HMR
initThemeColorSync();

// Initialize the app
try {
  createRoot(document.body).render(
    createElement(StrictMode, null, createElement(App)),
  );
} catch (error) {
  console.error(error);
  posthog.captureException(
    error instanceof Error ? error : new Error(String(error)),
    { source: 'renderer', handler: 'reactRootRender' },
  );
}
