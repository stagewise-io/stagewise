import MainApp from 'tmp/toolbar-main/index.js?raw';

import type { ToolbarConfig } from '@/config';
export type { ToolbarConfig } from '@/config';
export type * from '@/plugin';

export function initToolbar(config: ToolbarConfig) {
  // If the toolbar is already loaded, don't load another instance
  if (document.querySelector('stagewise-toolbar')) {
    console.warn('Stagewise Toolbar is already loaded - aborting init.');
    return;
  }

  const wrapper = document.createElement('stagewise-toolbar');
  wrapper.style.display = 'block';
  wrapper.style.position = 'fixed';
  wrapper.style.top = '0';
  wrapper.style.left = '0';
  wrapper.style.right = '0';
  wrapper.style.bottom = '0';
  wrapper.style.width = '100vw';
  wrapper.style.height = '100vh';
  wrapper.style.zIndex = '2147483647';
  wrapper.style.pointerEvents = 'none';

  const iframe = document.createElement('iframe');
  iframe.style.display = 'block';
  iframe.style.border = 'none';
  iframe.style.overflow = 'hidden';
  iframe.style.margin = '0';
  iframe.style.padding = '0';
  iframe.style.width = '100vw';
  iframe.style.height = '100vh';
  iframe.style.backgroundColor = 'transparent';
  iframe.style.pointerEvents = 'none';
  iframe.style.colorScheme = 'normal';
  iframe.sandbox.add('allow-same-origin');
  iframe.sandbox.add('allow-scripts');
  iframe.sandbox.add('allow-presentation');
  iframe.sandbox.add('allow-pointer-lock');
  iframe.allowTransparency = 'true';

  iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css"></head><body style="pointer-events: none;"></body></html>`;

  // We're injecting the script into the iframe as soon as the base document is loaded.
  iframe.addEventListener('load', () => {
    // Add the config to the iframe window.
    iframe.contentWindow.stagewiseConfig = config;

    // Configure the proxy object that handles interactivity tracking
    let lastMouseOverInteractiveAreaState = false;
    const handleMouseMove = (e: MouseEvent) => {
      const elementAtPoint = iframe.contentDocument.elementFromPoint(
        e.clientX,
        e.clientY,
      );

      // Check if the element is clickable (has click event handlers, is a button, link, etc.)
      const isInteractive =
        elementAtPoint &&
        elementAtPoint !== document.body &&
        elementAtPoint.tagName !== 'HTML';

      if (isInteractive !== lastMouseOverInteractiveAreaState) {
        iframe.style.pointerEvents = isInteractive ? 'auto' : 'none';
        lastMouseOverInteractiveAreaState = isInteractive;
      }
    };

    // Start watching for mouse moves in the main app realm and the toolbar realm.
    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    iframe.contentWindow.addEventListener('mousemove', handleMouseMove, {
      capture: true,
    });

    const devSuffix = import.meta.env.MODE === 'development' ? '?dev' : '';
    const imports = {
      react: `https://esm.sh/react@19.1.0${devSuffix}`,
      'react-dom': `https://esm.sh/react-dom@19.1.0${devSuffix}`,
      'react-dom/client': `https://esm.sh/react-dom@19.1.0/client${devSuffix}`,
      'react/jsx-runtime': `https://esm.sh/react@19.1.0/jsx-runtime${devSuffix}`,
    };

    // Load the main app into the iframe.
    const importmapScript = iframe.contentDocument.createElement('script');
    importmapScript.type = 'importmap';
    importmapScript.textContent = `{"imports":${JSON.stringify(imports)}}`;
    iframe.contentDocument.head.appendChild(importmapScript);

    // Load the main app into the iframe.
    const script = iframe.contentDocument.createElement('script');
    script.type = 'module';
    script.textContent = MainApp;
    iframe.contentDocument.head.appendChild(script);
  });

  wrapper.appendChild(iframe);
  document.body.appendChild(wrapper);
}
