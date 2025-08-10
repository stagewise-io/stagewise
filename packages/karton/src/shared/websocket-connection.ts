import type { WebSocketMessage } from './types.js';
import { serializeMessage, deserializeMessage } from './websocket-messages.js';

export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export type MessageHandler = (message: WebSocketMessage) => void;
export type EventHandler = () => void;
export type CloseEventHandler = (event: {
  code: number;
  reason: string;
}) => void;
export type ErrorHandler = (error: Error) => void;
export type RemoveListener = () => void;

export class WebSocketConnection {
  private ws: WebSocket | any;
  private state: ConnectionState;
  private messageQueue: WebSocketMessage[] = [];
  private messageHandlers: Set<MessageHandler> = new Set();
  private openHandlers: Set<EventHandler> = new Set();
  private closeHandlers: Set<CloseEventHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();

  constructor(websocket: WebSocket | any) {
    this.ws = websocket;
    this.state = ConnectionState.CONNECTING;

    this.setupEventListeners();

    // Check initial state after setting up listeners
    // This needs to be done in next tick to allow tests to setup handlers first
    if (typeof process !== 'undefined' && process.nextTick) {
      process.nextTick(() => {
        if (this.ws.readyState === 1) {
          this.handleOpen();
        } else if (this.ws.readyState === 3) {
          this.handleClose({ code: 1006, reason: 'Connection already closed' });
        }
      });
    } else {
      setTimeout(() => {
        if (this.ws.readyState === 1) {
          this.handleOpen();
        } else if (this.ws.readyState === 3) {
          this.handleClose({ code: 1006, reason: 'Connection already closed' });
        }
      }, 0);
    }
  }

  private setupEventListeners(): void {
    this.ws.addEventListener('open', this.handleOpen);
    this.ws.addEventListener('close', this.handleClose);
    this.ws.addEventListener('error', this.handleError);
    this.ws.addEventListener('message', this.handleMessage);
  }

  private cleanupEventListeners(): void {
    this.ws.removeEventListener('open', this.handleOpen);
    this.ws.removeEventListener('close', this.handleClose);
    this.ws.removeEventListener('error', this.handleError);
    this.ws.removeEventListener('message', this.handleMessage);
  }

  private handleOpen = (): void => {
    this.state = ConnectionState.OPEN;

    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendImmediate(message);
      }
    }

    this.openHandlers.forEach((handler) => handler());
  };

  private handleClose = (
    event: CloseEvent | { code: number; reason: string },
  ): void => {
    this.state = ConnectionState.CLOSED;
    this.messageQueue = [];
    this.closeHandlers.forEach((handler) =>
      handler({ code: event.code, reason: event.reason }),
    );
  };

  private handleError = (error: Event | Error): void => {
    const err = error instanceof Error ? error : new Error('WebSocket error');
    this.errorHandlers.forEach((handler) => handler(err));
  };

  private handleMessage = (event: MessageEvent): void => {
    try {
      const message = deserializeMessage(event.data);
      this.messageHandlers.forEach((handler) => handler(message));
    } catch (error) {
      console.error('Failed to deserialize WebSocket message:', error);
      this.handleError(error as Error);
    }
  };

  private sendImmediate(message: WebSocketMessage): void {
    const serialized = serializeMessage(message);
    this.ws.send(serialized);
  }

  public send(message: WebSocketMessage): void {
    if (this.state === ConnectionState.CLOSED) {
      throw new Error('Connection is closed');
    }

    if (this.state === ConnectionState.OPEN && this.ws.readyState === 1) {
      this.sendImmediate(message);
    } else {
      this.messageQueue.push(message);
    }
  }

  public onMessage(handler: MessageHandler): RemoveListener {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  public onOpen(handler: EventHandler): RemoveListener {
    this.openHandlers.add(handler);
    return () => {
      this.openHandlers.delete(handler);
    };
  }

  public onClose(handler: CloseEventHandler): RemoveListener {
    this.closeHandlers.add(handler);
    return () => {
      this.closeHandlers.delete(handler);
    };
  }

  public onError(handler: ErrorHandler): RemoveListener {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  public getState(): ConnectionState {
    return this.state;
  }

  public isOpen(): boolean {
    return this.state === ConnectionState.OPEN;
  }

  public close(): void {
    if (this.ws.readyState === 1 || this.ws.readyState === 0) {
      this.ws.close();
    }
    this.messageQueue = [];
    this.cleanupEventListeners();
  }
}
