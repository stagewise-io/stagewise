import type { Transport, KartonMessage } from '../../shared/transport.js';

export interface MessagePortProxy {
  setOnMessage: (handler: (message: KartonMessage) => void) => void;
  postMessage: (message: KartonMessage) => void;
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
  private messageHandler: ((message: KartonMessage) => void) | null = null;
  private closeHandler:
    | ((event?: { code: number; reason: string }) => void)
    | null = null;
  private errorHandler: ((error: Error) => void) | null = null;
  private unsubscribeMessage: (() => void) | null = null;
  private portProxy: MessagePortProxy;

  constructor({ messagePort }: { messagePort: MessagePortProxy }) {
    this.portProxy = messagePort;
  }

  /**
   * Send a message through the bridge.
   * For state sync, this fails silently if the bridge is not ready.
   * For RPC, the calling code should check isOpen() first.
   */
  send(message: KartonMessage): void {
    try {
      this.portProxy.postMessage(message);
    } catch (err) {
      this.errorHandler?.(
        err instanceof Error ? err : new Error('Failed to send message'),
      );
    }
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    this.messageHandler = handler;
    return () => {
      this.messageHandler = null;
    };
  }

  close(): void {
    this.unsubscribeMessage?.();
    this.closeHandler?.();
  }

  isOpen(): boolean {
    return true;
  }

  onOpen(handler: () => void): () => void {
    handler(); // We always report that the port is actually open imemdiately.
    return () => {};
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

  startTransport(): void {
    this.portProxy.setOnMessage((message) => {
      // Ignore empty messages
      if (!message) return;

      try {
        this.messageHandler?.(message);
      } catch (err) {
        this.errorHandler?.(
          err instanceof Error
            ? err
            : new Error('Failed to deserialize message'),
        );
      }
    });
  }
}
