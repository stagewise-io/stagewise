import type { Message } from './types.js';

export type KartonMessage = Message;

export interface Transport {
  getConnectionId?(): string | undefined;
  send(message: KartonMessage): void;
  onMessage(handler: (message: KartonMessage) => void): () => void;
  close(): void;
  isOpen(): boolean;
  onOpen(handler: () => void): () => void;
  onClose(
    handler: (event?: { code: number; reason: string }) => void,
  ): () => void;
  onError(handler: (error: Error) => void): () => void;
  startTransport(): void; // should be called once the rest of karton is initialized and the transport can start
}

export interface ServerTransport {
  onConnection(handler: (serverTransport: Transport) => void): void;
  close(): Promise<void>;
}
