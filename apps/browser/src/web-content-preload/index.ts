import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';

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
