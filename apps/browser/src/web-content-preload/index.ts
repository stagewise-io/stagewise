import { contextBridge, ipcRenderer } from 'electron';
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { getHotkeyDefinitionForEvent } from '@shared/hotkeys';
import type { MessagePortProxy } from '@stagewise/karton/client';
import type { KartonMessage } from '@stagewise/karton/shared';

declare global {
  interface Window {
    tunnelKeyDown: (keyDownEvent: KeyboardEvent) => void;
    tunnelWheel: (wheelEvent: WheelEvent) => void;
  }
}

/**
 * Compute origin validity once at script load time.
 * Since preload scripts are reloaded on navigation, the origin can't change
 * during the script's lifetime. This provides better performance than
 * checking on every operation.
 *
 * This is captured in the isolated world and cannot be spoofed by the main world.
 */
const IS_VALID_PAGES_CONTEXT = (() => {
  try {
    return window.location.origin === 'stagewise://internal';
  } catch {
    return false;
  }
})();

/**
 * Runtime origin check for defensive purposes (e.g., event handlers).
 * Most operations should just use IS_VALID_PAGES_CONTEXT since the preload
 * script is reloaded on navigation.
 */
function isValidOrigin(): boolean {
  // Use the cached value - origin can't change without page reload
  return IS_VALID_PAGES_CONTEXT;
}

/**
 * Reconnection configuration for PagesAPI karton connection
 */
const RECONNECT_CONFIG = {
  MAX_ATTEMPTS: 10,
  BASE_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds
};

/**
 * Reconnection state for PagesAPI
 */
let pagesApiReconnectAttempts = 0;
let _pagesApiReconnectTimer: NodeJS.Timeout | null = null;
let isPagesApiReconnecting = false;

/**
 * Current message handler for PagesAPI - stored so we can re-apply it on reconnection
 */
let currentPagesApiMessageHandler: ((message: KartonMessage) => void) | null =
  null;

/**
 * Current port reference for PagesAPI - will be updated on reconnection
 */
let currentPagesApiPort: MessagePort | null = null;

/**
 * Flag to track if the connection has been invalidated due to origin change
 */
let isPagesApiConnectionInvalidated = false;

/**
 * Invalidate the PagesAPI connection (e.g., on origin change)
 */
function invalidatePagesApiConnection() {
  isPagesApiConnectionInvalidated = true;

  // Close the current port if it exists
  if (currentPagesApiPort) {
    try {
      currentPagesApiPort.close();
    } catch {
      // Port might already be closed
    }
    currentPagesApiPort = null;
  }

  // Clear message handler
  currentPagesApiMessageHandler = null;

  // Clear any pending reconnection
  if (_pagesApiReconnectTimer) {
    clearTimeout(_pagesApiReconnectTimer);
    _pagesApiReconnectTimer = null;
  }

  isPagesApiReconnecting = false;
  pagesApiReconnectAttempts = 0;

  console.warn('[PagesAPI] Connection invalidated due to origin change');
}

/**
 * Setup port listeners for PagesAPI connection monitoring
 */
function setupPagesApiPortListeners(port: MessagePort) {
  // Check if connection was invalidated
  if (isPagesApiConnectionInvalidated) {
    console.warn(
      '[PagesAPI] Connection was invalidated - refusing to setup port listeners',
    );
    return;
  }

  // Validate origin before setting up listeners
  if (!isValidOrigin()) {
    console.warn(
      '[PagesAPI] Origin check failed - refusing to setup port listeners',
    );
    invalidatePagesApiConnection();
    return;
  }

  // Handle message errors (connection issues)
  port.onmessageerror = (error) => {
    console.error('[PagesAPI] MessagePort error:', error);
    attemptPagesApiReconnect();
  };

  // Re-apply message handler if it exists
  if (currentPagesApiMessageHandler) {
    port.onmessage = (event) => {
      // Check if connection was invalidated
      if (isPagesApiConnectionInvalidated) {
        return;
      }

      // Validate origin on every message
      if (!isValidOrigin()) {
        console.warn(
          '[PagesAPI] Origin check failed on message - invalidating connection',
        );
        invalidatePagesApiConnection();
        return;
      }
      currentPagesApiMessageHandler!(event.data as KartonMessage);
    };
  }
}

/**
 * Attempt to reconnect PagesAPI with exponential backoff
 */
function attemptPagesApiReconnect() {
  // Check if connection was invalidated
  if (isPagesApiConnectionInvalidated) {
    return;
  }

  // Validate origin before attempting reconnection
  if (!isValidOrigin()) {
    console.warn('[PagesAPI] Origin check failed - invalidating connection');
    invalidatePagesApiConnection();
    return;
  }

  // Prevent multiple simultaneous reconnection attempts
  if (isPagesApiReconnecting) {
    return;
  }

  if (pagesApiReconnectAttempts >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
    console.error('[PagesAPI] Max reconnection attempts reached');
    return;
  }

  isPagesApiReconnecting = true;
  pagesApiReconnectAttempts++;

  // Calculate delay with exponential backoff
  const delay = Math.min(
    RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, pagesApiReconnectAttempts - 1),
    RECONNECT_CONFIG.MAX_DELAY,
  );

  console.log(
    `[PagesAPI] Reconnecting in ${delay}ms (attempt ${pagesApiReconnectAttempts}/${RECONNECT_CONFIG.MAX_ATTEMPTS})`,
  );

  _pagesApiReconnectTimer = setTimeout(() => {
    _pagesApiReconnectTimer = null;
    performPagesApiReconnect();
  }, delay);
}

/**
 * Perform the actual PagesAPI reconnection
 */
function performPagesApiReconnect() {
  // Check if connection was invalidated
  if (isPagesApiConnectionInvalidated) {
    isPagesApiReconnecting = false;
    return;
  }

  // Validate origin before reconnecting
  if (!isValidOrigin()) {
    console.warn('[PagesAPI] Origin check failed - invalidating connection');
    invalidatePagesApiConnection();
    isPagesApiReconnecting = false;
    return;
  }

  try {
    // Close old port before creating new channel to prevent leaks
    if (currentPagesApiPort) {
      try {
        currentPagesApiPort.close();
      } catch {
        // Port might already be closed
      }
    }

    // Create new MessageChannel
    const newChannel = new MessageChannel();

    // Send port2 to main process
    ipcRenderer.postMessage('karton-connect', 'pages-api', [newChannel.port2]);

    // Update current port reference
    currentPagesApiPort = newChannel.port1;

    // Setup listeners on new port (this will also re-apply the message handler)
    setupPagesApiPortListeners(currentPagesApiPort);

    console.log('[PagesAPI] Reconnection successful');

    // Reset reconnection state
    pagesApiReconnectAttempts = 0;
    isPagesApiReconnecting = false;
  } catch (error) {
    console.error('[PagesAPI] Reconnection failed:', error);
    isPagesApiReconnecting = false;

    // Try again
    attemptPagesApiReconnect();
  }
}

/**
 * Initialize PagesAPI connection only if origin is valid
 */
function initializePagesApiConnection(): MessagePortProxy | null {
  // Use the cached constant - checked once at script load time
  if (!IS_VALID_PAGES_CONTEXT) {
    console.debug(
      '[PagesAPI] Origin check failed - PagesAPI connection not available',
    );
    return null;
  }

  const msgChannel = new MessageChannel();
  currentPagesApiPort = msgChannel.port1;

  // Request the port from main process
  ipcRenderer.postMessage('karton-connect', 'pages-api', [msgChannel.port2]);

  /**
   * MessagePort proxy that works with reconnection and origin validation
   * The port will automatically start when onmessage is set
   */
  const messagePortProxy: MessagePortProxy = {
    setOnMessage: (handler: (message: KartonMessage) => void) => {
      // Check if connection was invalidated
      if (isPagesApiConnectionInvalidated) {
        console.warn(
          '[PagesAPI] Connection was invalidated - refusing to set message handler',
        );
        return;
      }

      // Validate origin before setting message handler
      if (!isValidOrigin()) {
        console.warn(
          '[PagesAPI] Origin check failed - invalidating connection',
        );
        invalidatePagesApiConnection();
        return;
      }

      // Store the handler so we can re-apply it on reconnection
      currentPagesApiMessageHandler = handler;

      if (!currentPagesApiPort) {
        console.error('[PagesAPI] Port not available');
        return;
      }

      // Apply message handler to current port with origin validation
      currentPagesApiPort.onmessage = (event) => {
        // Check if connection was invalidated
        if (isPagesApiConnectionInvalidated) {
          return;
        }

        // Validate origin on every message
        if (!isValidOrigin()) {
          console.warn(
            '[PagesAPI] Origin check failed on message - invalidating connection',
          );
          invalidatePagesApiConnection();
          return;
        }
        handler(event.data as KartonMessage);
      };

      // Setup error handler for detecting connection issues
      currentPagesApiPort.onmessageerror = (error) => {
        console.error('[PagesAPI] MessagePort error:', error);
        attemptPagesApiReconnect();
      };
    },
    postMessage: (message: KartonMessage) => {
      // Check if connection was invalidated
      if (isPagesApiConnectionInvalidated) {
        console.warn(
          '[PagesAPI] Connection was invalidated - refusing to post message',
        );
        return;
      }

      // Validate origin before posting message
      if (!isValidOrigin()) {
        console.warn(
          '[PagesAPI] Origin check failed - invalidating connection',
        );
        invalidatePagesApiConnection();
        return;
      }

      if (!currentPagesApiPort) {
        console.error('[PagesAPI] Port not available');
        return;
      }

      try {
        currentPagesApiPort.postMessage(message);
      } catch (error) {
        console.error('[PagesAPI] Failed to post message:', error);
        // Trigger reconnection if post fails
        attemptPagesApiReconnect();
      }
    },
  };

  return messagePortProxy;
}

// Initialize PagesAPI connection
const pagesApiPortProxy = initializePagesApiConnection();

// Expose PagesAPI to main world only if we're in the valid context
// Note: pagesApiPortProxy is only non-null if IS_VALID_PAGES_CONTEXT was true
if (pagesApiPortProxy) {
  contextBridge.exposeInMainWorld('stagewisePagesApi', {
    portProxy: pagesApiPortProxy,
  });

  // Clean up connection on page unload
  window.addEventListener('beforeunload', () => {
    invalidatePagesApiConnection();
  });
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
    // Pinch-to-zoom on trackpad synthesizes ctrlKey - always allow this for native zoom feel
    if (e.ctrlKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      window.tunnelWheel(e);
      return;
    }

    // For CMD+wheel (metaKey on Mac), only zoom if it's a mouse wheel, not trackpad scroll.
    // Trackpads use deltaMode 0 (DOM_DELTA_PIXEL), mouse wheels use deltaMode 1 (DOM_DELTA_LINE).
    // This prevents two-finger trackpad scrolling with CMD from triggering zoom.
    if (e.metaKey && e.deltaMode !== 0) {
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
