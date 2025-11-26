import type { Transport, KartonMessage } from '../shared/transport.js';
import {
  serializeMessage,
  deserializeMessage,
} from '../shared/websocket-messages.js';

/**
 * Bridge interface for Electron preload to renderer communication.
 * The preload script wraps the MessagePort and exposes these methods
 * through contextBridge.
 */
export interface ElectronBridge {
  /**
   * Send a serialized message through the port.
   */
  send(data: string): void;

  /**
   * Register a message handler. Returns a function to unregister.
   */
  onMessage(handler: (data: string) => void): () => void;

  /**
   * Check if the port is ready for communication.
   */
  isReady(): boolean;

  /**
   * Wait for the port to be ready.
   * The connection is established automatically by the preload script.
   */
  waitForReady(): Promise<void>;
}

/**
 * Configuration for ElectronClientTransport.
 */
export interface ElectronClientTransportConfig {
  /**
   * The bridge object exposed by the preload script.
   * This wraps the MessagePort and provides send/receive methods.
   */
  bridge: ElectronBridge;
}

/**
 * Client-side transport for Electron using a bridge to MessagePort.
 *
 * The actual MessagePort lives in the preload script. This transport
 * communicates with it through the bridge interface exposed via contextBridge.
 *
 * Error handling:
 * - State sync messages (send) fail silently when the port is not ready
 * - RPC calls will receive proper error responses via the RPC layer
 */
export class ElectronClientTransport implements Transport {
  private bridge: ElectronBridge;
  private messageHandler: ((message: KartonMessage) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler:
    | ((event?: { code: number; reason: string }) => void)
    | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private _isOpen = false;
  private _isClosed = false;
  private unsubscribeMessage: (() => void) | null = null;

  constructor(config: ElectronClientTransportConfig) {
    this.bridge = config.bridge;

    // Setup message handler through the bridge
    this.unsubscribeMessage = this.bridge.onMessage((data: string) => {
      this.handleMessage(data);
    });

    // Wait for the bridge to be ready, then signal open
    if (this.bridge.isReady()) {
      this._isOpen = true;
      // Notify in next tick to allow handlers to be attached
      setTimeout(() => {
        if (!this._isClosed) {
          this.openHandler?.();
        }
      }, 0);
    } else {
      this.bridge.waitForReady().then(() => {
        if (!this._isClosed) {
          this._isOpen = true;
          this.openHandler?.();
        }
      });
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = deserializeMessage(data);
      this.messageHandler?.(message);
    } catch (err) {
      this.errorHandler?.(
        err instanceof Error ? err : new Error('Failed to deserialize message'),
      );
    }
  }

  /**
   * Send a message through the bridge.
   * For state sync, this fails silently if the bridge is not ready.
   * For RPC, the calling code should check isOpen() first.
   */
  send(message: KartonMessage): void {
    if (!this._isOpen || this._isClosed) {
      // Silent fail for state sync messages
      return;
    }

    try {
      const serialized = serializeMessage(message);
      this.bridge.send(serialized);
    } catch {
      // Fail silently for state sync
    }
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = null;
    };
  }

  close(): void {
    if (this._isClosed) return;

    this._isClosed = true;
    this._isOpen = false;

    // Unsubscribe from bridge messages
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }

    this.closeHandler?.({ code: 1000, reason: 'Closed by client' });
  }

  isOpen(): boolean {
    return this._isOpen && !this._isClosed;
  }

  onOpen(handler: () => void): () => void {
    this.openHandler = handler;
    if (this._isOpen && !this._isClosed) {
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
