import type { WebSocketMessage } from './types.js';

export type KartonMessage = WebSocketMessage;

export interface Transport {
  send(message: KartonMessage): void;
  onMessage(handler: (message: KartonMessage) => void): () => void;
  close(): void;
  isOpen(): boolean;
  onOpen(handler: () => void): () => void;
  onClose(
    handler: (event?: { code: number; reason: string }) => void,
  ): () => void;
  onError(handler: (error: Error) => void): () => void;
}

export interface ServerTransport {
  onConnection(handler: (clientTransport: Transport) => void): void;
  close(): Promise<void>;
}
