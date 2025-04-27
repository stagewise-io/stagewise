import type { WebSocket } from 'ws';
import type { WebSocketMessage, PendingRequest } from './types';

export interface WebSocketConnectionOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  requestTimeout?: number;
}

export const DEFAULT_OPTIONS: WebSocketConnectionOptions = {
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  requestTimeout: 5000,
};

export class WebSocketConnectionManager {
  protected ws: WebSocket | null = null;
  protected pendingRequests: Map<string, PendingRequest> = new Map();
  protected reconnectAttempts = 0;
  protected options: WebSocketConnectionOptions;

  constructor(options: WebSocketConnectionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  protected setupWebSocketHandlers(ws: WebSocket) {
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      console.log('WebSocket disconnected');
      this.handleDisconnect();
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  protected handleDisconnect() {
    if (this.reconnectAttempts < this.options.maxReconnectAttempts!) {
      this.reconnectAttempts++;
      console.log(
        `Attempting to reconnect (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})...`,
      );
      setTimeout(
        () => this.reconnect(),
        this.options.reconnectDelay! * this.reconnectAttempts,
      );
    } else {
      console.error('Max reconnection attempts reached');
      this.clearPendingRequests(new Error('Connection closed'));
    }
  }

  protected clearPendingRequests(error: Error) {
    this.pendingRequests.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingRequests.clear();
  }

  protected handleMessage(message: WebSocketMessage) {
    // To be implemented by subclasses
  }

  protected reconnect() {
    // To be implemented by subclasses
  }

  protected sendRequest<T = any>(
    message: any,
    timeoutMs: number = this.options.requestTimeout!,
  ): Promise<T> {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const id = crypto.randomUUID();
    const requestMessage = {
      ...message,
      id,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws?.send(JSON.stringify(requestMessage));
    });
  }

  protected handleResponse(id: string, payload: any) {
    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      console.warn(`Received response for unknown request ID: ${id}`);
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(id);
    pendingRequest.resolve(payload);
  }

  protected handleError(id: string, error: string) {
    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      console.warn(`Received error for unknown request ID: ${id}`);
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(id);
    pendingRequest.reject(new Error(error));
  }

  public close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clearPendingRequests(new Error('Connection closed by user'));
  }
}
