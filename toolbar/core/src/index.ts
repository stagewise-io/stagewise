import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import appStyle from './app.css?inline';
import { App } from './app.tsx';

// Load styling into the document
const styleNode = document.createElement('style');
styleNode.textContent = appStyle;
document.head.appendChild(styleNode);

// Initialize the app
createRoot(document.body).render(
  createElement(
    StrictMode,
    null,
    createElement(App, globalThis.stagewiseConfig),
  ),
);
