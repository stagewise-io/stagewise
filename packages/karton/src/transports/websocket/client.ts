import { WebSocketConnection } from './utils.js';
import type { Transport, KartonMessage } from '../../shared/transport.js';

export class WebSocketTransport implements Transport {
  private connection: WebSocketConnection;

  constructor(urlOrWs: string | WebSocket) {
    let ws: WebSocket;
    if (typeof urlOrWs === 'string') {
      ws = new WebSocket(urlOrWs);
    } else {
      ws = urlOrWs;
    }
    this.connection = new WebSocketConnection(ws);
  }

  startTransport(): void {
    this.connection.startTransport();
  }

  send(message: KartonMessage): void {
    this.connection.send(message);
  }

  onMessage(handler: (message: KartonMessage) => void): () => void {
    return this.connection.onMessage(handler);
  }

  close(): void {
    this.connection.close();
  }

  isOpen(): boolean {
    return this.connection.isOpen();
  }

  onOpen(handler: () => void): () => void {
    return this.connection.onOpen(handler);
  }

  onClose(
    handler: (event?: { code: number; reason: string }) => void,
  ): () => void {
    return this.connection.onClose((e) => handler(e));
  }

  onError(handler: (error: Error) => void): () => void {
    return this.connection.onError((e) =>
      handler(e instanceof Error ? e : new Error('WebSocket error')),
    );
  }
}
