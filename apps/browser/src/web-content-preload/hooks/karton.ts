import {
  type TabKartonContract,
  defaultState,
} from '@shared/karton-contracts/web-contents-preload';
import {
  ElectronClientTransport,
  type MessagePortProxy,
} from '@stagewise/karton/client';
import { createKartonReactClient } from '@stagewise/karton/react/client';
import type { KartonMessage } from '@stagewise/karton/shared';
import { ipcRenderer } from 'electron';

const RECONNECT_CONFIG = {
  MAX_ATTEMPTS: 10,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
};

let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let isReconnecting = false;
let currentMessageHandler: ((message: KartonMessage) => void) | null = null;
let currentPort: MessagePort;

function setupPortListeners(port: MessagePort) {
  port.onmessageerror = () => {
    attemptReconnect();
  };

  if (currentMessageHandler) {
    port.onmessage = (event) => {
      currentMessageHandler!(event.data as KartonMessage);
    };
  }
}

function attemptReconnect() {
  if (isReconnecting) return;
  if (reconnectAttempts >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
    return;
  }

  isReconnecting = true;
  reconnectAttempts++;

  const delay = Math.min(
    RECONNECT_CONFIG.BASE_DELAY * 2 ** (reconnectAttempts - 1),
    RECONNECT_CONFIG.MAX_DELAY,
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    performReconnect();
  }, delay);
}

function performReconnect() {
  try {
    const newChannel = new MessageChannel();
    ipcRenderer.postMessage('karton-connect', 'tab', [newChannel.port2]);
    currentPort = newChannel.port1;
    setupPortListeners(currentPort);

    reconnectAttempts = 0;
    isReconnecting = false;
  } catch (_error) {
    isReconnecting = false;
    attemptReconnect();
  }
}

const msgChannel = new MessageChannel();
currentPort = msgChannel.port1;
ipcRenderer.postMessage('karton-connect', 'tab', [msgChannel.port2]);

const kartonMessagePort: MessagePortProxy = {
  setOnMessage: (handler: (message: KartonMessage) => void) => {
    currentMessageHandler = handler;

    currentPort.onmessage = (event) => {
      handler(event.data as KartonMessage);
    };

    currentPort.onmessageerror = () => {
      attemptReconnect();
    };
  },
  postMessage: (message: KartonMessage) => {
    try {
      currentPort.postMessage(message);
    } catch (_error) {
      attemptReconnect();
    }
  },
};

window.addEventListener('beforeunload', () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  isReconnecting = false;
  reconnectAttempts = RECONNECT_CONFIG.MAX_ATTEMPTS;
  try {
    currentPort.close();
  } catch {
    // Port might already be closed
  }
});

const [KartonProvider, useKartonState, useKartonProcedure, useKartonConnected] =
  createKartonReactClient<TabKartonContract>({
    transport: new ElectronClientTransport({
      messagePort: kartonMessagePort,
    }),
    fallbackState: defaultState,
    procedures: {},
  });

export {
  KartonProvider,
  useKartonState,
  useKartonProcedure,
  useKartonConnected,
};
