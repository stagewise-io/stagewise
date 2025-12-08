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

const msgChannel = new MessageChannel();

// Request the port from main process
ipcRenderer.postMessage('karton-connect', 'tab', [msgChannel.port2]);

const kartonMessagePort: MessagePortProxy = {
  setOnMessage: (handler: (message: KartonMessage) => void) => {
    msgChannel.port1.onmessage = (event) => {
      handler(event.data as KartonMessage);
    };
  },
  postMessage: (message: KartonMessage) => {
    msgChannel.port1.postMessage(message);
  },
};

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
