import type { Transport, KartonMessage } from '../shared/transport.js';
import {
  serializeMessage,
  deserializeMessage,
} from '../shared/websocket-messages.js';

export interface ElectronBridge {
  send(channel: string, ...args: any[]): void;
  on(channel: string, listener: (event: any, ...args: any[]) => void): void;
  removeListener?(channel: string, listener: (...args: any[]) => void): void;
}

export interface ElectronClientTransportConfig {
  bridge: ElectronBridge;
  channel?: string;
}

export class ElectronClientTransport implements Transport {
  private bridge: ElectronBridge;
  private channel: string;
  private messageHandler: ((message: KartonMessage) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler:
    | ((event?: { code: number; reason: string }) => void)
    | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private _isOpen = false;

  constructor(config: ElectronClientTransportConfig) {
    this.bridge = config.bridge;
    this.channel = config.channel || 'karton';

    // Setup listener
    this.setupListener();

    // Send handshake and simulate open
    // We do this in next tick to allow handlers to be attached
    setTimeout(() => {
      this.bridge.send(this.channel, 'CONNECT');
      this._isOpen = true;
      this.openHandler?.();
    }, 0);
  }

  private setupListener() {
    this.bridge.on(this.channel, (_event: any, data: any) => {
      if (typeof data === 'string') {
        try {
          const message = deserializeMessage(data);
          this.messageHandler?.(message);
        } catch (err) {
          this.errorHandler?.(
            err instanceof Error
              ? err
              : new Error('Failed to deserialize message'),
          );
        }
      }
    });
  }

  send(message: KartonMessage): void {
    if (!this._isOpen) {
      throw new Error('Transport not open');
    }
    const serialized = serializeMessage(message);
    this.bridge.send(this.channel, serialized);
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = null;
    };
  }

  close(): void {
    this._isOpen = false;
    // We can't easily close IPC, but we can stop listening/sending
    this.closeHandler?.({ code: 1000, reason: 'Closed by client' });
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  onOpen(handler: () => void): () => void {
    this.openHandler = handler;
    if (this._isOpen) {
      handler();
    }
    return () => {
      this.openHandler = null;
    };
  }

  onClose(
    handler: (event?: { code: number; reason: string }) => void,
  ): () => void {
    this.closeHandler = handler;
    return () => {
      this.closeHandler = null;
    };
  }

  onError(handler: (error: Error) => void): () => void {
    this.errorHandler = handler;
    return () => {
      this.errorHandler = null;
    };
  }
}
