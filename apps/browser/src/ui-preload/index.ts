import { contextBridge, ipcRenderer } from 'electron';

/**
 * The received karton MessagePort, stored once received.
 */
let kartonPort: MessagePort | null = null;

/**
 * Message handlers registered by the renderer.
 */
const messageHandlers: ((data: string) => void)[] = [];

/**
 * Callbacks waiting for the port to be ready.
 */
const readyCallbacks: (() => void)[] = [];

/**
 * Whether the port is ready for communication.
 */
let isPortReady = false;

/**
 * Listen for the karton port from the main process.
 * The main process sends this via webContents.postMessage('karton-port', ..., [port]).
 */
ipcRenderer.on('karton-port', (event) => {
  const port = event.ports[0];
  if (port) {
    // Close the old port if we had one (from previous connection)
    if (kartonPort) {
      try {
        kartonPort.close();
      } catch {
        // Port may already be closed
      }
    }

    kartonPort = port;

    // Setup message handling on the port
    kartonPort.onmessage = (msgEvent: MessageEvent) => {
      const data = msgEvent.data;
      if (typeof data === 'string') {
        for (const handler of messageHandlers) {
          try {
            handler(data);
          } catch (err) {
            console.error('[Karton] Error in message handler:', err);
          }
        }
      }
    };

    kartonPort.onmessageerror = (msgEvent: MessageEvent) => {
      console.error('[Karton] MessagePort error:', msgEvent);
    };

    // Start the port to begin receiving messages
    kartonPort.start();
    isPortReady = true;

    // Notify all waiting callbacks
    for (const callback of readyCallbacks) {
      callback();
    }
    readyCallbacks.length = 0;
  } else {
    console.warn('[Karton] Port message received but no port attached');
  }
});

// Auto-connect on preload startup.
// The main process has already pre-created the port, so it will be delivered immediately.
ipcRenderer.send('karton-connect');

/**
 * Expose the karton bridge API to the renderer.
 * Instead of exposing the raw MessagePort (which can't go through contextBridge),
 * we expose send/receive methods that the preload proxies to the port.
 */
contextBridge.exposeInMainWorld('electron', {
  karton: {
    /**
     * Send a message through the karton port.
     * Fails silently if the port is not ready.
     */
    send: (data: string): void => {
      if (kartonPort && isPortReady) {
        try {
          kartonPort.postMessage(data);
        } catch (err) {
          console.debug('[Karton Preload] Failed to send message:', err);
        }
      } else {
        console.debug('[Karton Preload] Cannot send: port not ready');
      }
    },

    /**
     * Register a message handler. Returns a function to unregister.
     */
    onMessage: (handler: (data: string) => void): (() => void) => {
      messageHandlers.push(handler);
      return () => {
        const index = messageHandlers.indexOf(handler);
        if (index !== -1) {
          messageHandlers.splice(index, 1);
        }
      };
    },

    /**
     * Check if the karton port is ready.
     */
    isReady: (): boolean => {
      return isPortReady;
    },

    /**
     * Wait for the port to be ready.
     * The connection is established automatically on preload startup.
     */
    waitForReady: (): Promise<void> => {
      return new Promise((resolve) => {
        if (isPortReady) {
          resolve();
        } else {
          readyCallbacks.push(resolve);
        }
      });
    },
  },
});
