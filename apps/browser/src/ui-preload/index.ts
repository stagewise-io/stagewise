import { contextBridge, ipcRenderer } from 'electron';
import type { MessagePortProxy } from '@stagewise/karton/client';
import type { KartonMessage } from '@stagewise/karton/shared';

/**
 * Reconnection configuration
 */
const RECONNECT_CONFIG = {
  MAX_ATTEMPTS: 10,
  BASE_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds
};

/**
 * Reconnection state
 */
let reconnectAttempts = 0;
let _reconnectTimer: NodeJS.Timeout | null = null;
let isReconnecting = false;

/**
 * Current message handler - stored so we can re-apply it on reconnection
 */
let currentMessageHandler: ((message: KartonMessage) => void) | null = null;

/**
 * Current port reference - will be updated on reconnection
 */
let currentPort: MessagePort;

/**
 * Dispatch reconnection events to renderer
 */
function dispatchReconnectEvent(
  type: 'reconnecting' | 'reconnected' | 'failed',
  attempt?: number,
) {
  window.dispatchEvent(
    new CustomEvent('karton-reconnect', {
      detail: { type, attempt },
    }),
  );
}

/**
 * Setup port listeners for connection monitoring
 * Note: MessagePort in renderer doesn't have 'onclose' - only 'onmessageerror'
 */
function setupPortListeners(port: MessagePort) {
  // Handle message errors (connection issues)
  port.onmessageerror = (error) => {
    console.error('[Karton] MessagePort error:', error);
    attemptReconnect();
  };

  // Re-apply message handler if it exists
  if (currentMessageHandler) {
    port.onmessage = (event) => {
      currentMessageHandler!(event.data as KartonMessage);
    };
  }
}

/**
 * Attempt to reconnect with exponential backoff
 */
function attemptReconnect() {
  // Prevent multiple simultaneous reconnection attempts
  if (isReconnecting) {
    return;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
    console.error('[Karton] Max reconnection attempts reached');
    dispatchReconnectEvent('failed', reconnectAttempts);
    return;
  }

  isReconnecting = true;
  reconnectAttempts++;

  // Calculate delay with exponential backoff
  const delay = Math.min(
    RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, reconnectAttempts - 1),
    RECONNECT_CONFIG.MAX_DELAY,
  );

  console.log(
    `[Karton] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${RECONNECT_CONFIG.MAX_ATTEMPTS})`,
  );
  dispatchReconnectEvent('reconnecting', reconnectAttempts);

  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    performReconnect();
  }, delay);
}

/**
 * Perform the actual reconnection
 */
function performReconnect() {
  try {
    // Create new MessageChannel
    const newChannel = new MessageChannel();

    // Send port2 to main process
    ipcRenderer.postMessage('karton-connect', 'ui-main', [newChannel.port2]);

    // Update current port reference
    currentPort = newChannel.port1;

    // Setup listeners on new port (this will also re-apply the message handler)
    setupPortListeners(currentPort);

    console.log('[Karton] Reconnection successful');
    dispatchReconnectEvent('reconnected');

    // Reset reconnection state
    reconnectAttempts = 0;
    isReconnecting = false;
  } catch (error) {
    console.error('[Karton] Reconnection failed:', error);
    isReconnecting = false;

    // Try again
    attemptReconnect();
  }
}

/**
 * Initialize the first connection
 */
const msgChannel = new MessageChannel();
currentPort = msgChannel.port1;

// Request the port from main process
ipcRenderer.postMessage('karton-connect', 'ui-main', [msgChannel.port2]);

/**
 * MessagePort proxy that works with reconnection
 * The port will automatically start when onmessage is set
 */
const messagePortProxy: MessagePortProxy = {
  setOnMessage: (handler: (message: KartonMessage) => void) => {
    // Store the handler so we can re-apply it on reconnection
    currentMessageHandler = handler;

    // Apply message handler to current port
    currentPort.onmessage = (event) => {
      handler(event.data as KartonMessage);
    };

    // Setup error handler for detecting connection issues
    currentPort.onmessageerror = (error) => {
      console.error('[Karton] MessagePort error:', error);
      attemptReconnect();
    };
  },
  postMessage: (message: KartonMessage) => {
    try {
      currentPort.postMessage(message);
    } catch (error) {
      console.error('[Karton] Failed to post message:', error);
      // Trigger reconnection if post fails
      attemptReconnect();
    }
  },
};

// Listen for IPC messages from main process and forward as DOM events
ipcRenderer.on('stagewise-tab-focused', (_event, tabId) => {
  window.dispatchEvent(
    new CustomEvent('stagewise-tab-focused', { detail: tabId }),
  );
});

/**
 * Thin bridge API exposed to renderer.
 * The transport layer handles all the complexity.
 */
contextBridge.exposeInMainWorld('electron', {
  karton: {
    portProxy: messagePortProxy,
  },
});
