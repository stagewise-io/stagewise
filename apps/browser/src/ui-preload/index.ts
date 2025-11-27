import { contextBridge, ipcRenderer } from 'electron';
import type { MessagePortProxy } from '@stagewise/karton/client';
import type { KartonMessage } from '@stagewise/karton/shared';

/**
 * MessageChannel for karton communication.
 */
const msgChannel = new MessageChannel();

// Request the port from main process
ipcRenderer.postMessage('karton-connect', 'ui-main', [msgChannel.port2]);

const messagePortProxy: MessagePortProxy = {
  setOnMessage: (handler: (message: KartonMessage) => void) => {
    msgChannel.port1.onmessage = (event) => {
      handler(event.data as KartonMessage);
    };
  },
  postMessage: (message: KartonMessage) => {
    msgChannel.port1.postMessage(message);
  },
};

/**
 * Thin bridge API exposed to renderer.
 * The transport layer handles all the complexity.
 */
contextBridge.exposeInMainWorld('electron', {
  karton: {
    portProxy: messagePortProxy,
  },
});
