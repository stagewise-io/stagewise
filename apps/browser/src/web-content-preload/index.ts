import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';

declare global {
  interface Window {
    tunnelKeyDown: (keyDownEvent: KeyboardEvent) => void;
    tunnelWheel: (wheelEvent: WheelEvent) => void;
  }
}

// Dominant captures in capture phase
window.addEventListener(
  'keydown',
  (e) => {
    const hotkeyDef = getHotkeyDefinitionForEvent(e);
    if (hotkeyDef?.captureDominantly) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      window.tunnelKeyDown(e);
    }
  },
  { capture: true },
);

// Non-dominant captures in bubble phase
window.addEventListener('keydown', (e) => {
  // Only tunnel up if event was not captured by a dominant listener in the capture phase
  if (e.defaultPrevented) return;
  window.tunnelKeyDown(e);
});

// Capture wheel events with CMD/Ctrl for zoom
window.addEventListener(
  'wheel',
  (e) => {
    // Only intercept wheel events when CMD/Ctrl is pressed
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      window.tunnelWheel(e);
    }
  },
  { capture: true, passive: false },
);

/**
 * Setup section for the actual app that offers the context element selection UI
 */
window.addEventListener(
  'DOMContentLoaded',
  () => {
    const container = document.createElement('stagewise-container');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100vw';
    container.style.height = '100vh';
    container.style.zIndex = '2147483647';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
    const host = container.attachShadow({ mode: 'closed' });

    // Initialize the app
    try {
      createRoot(host).render(
        createElement(StrictMode, null, createElement(App)),
      );
    } catch (error) {
      console.error(error);
    }
  },
  { capture: true, once: true, passive: true },
);
