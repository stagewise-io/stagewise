import type { WebSocket } from 'ws';
import type { WebSocketMessage, PendingRequest } from './legacy.types';

/**
 * Configuration options for WebSocket connections
 */
export interface WebSocketConnectionOptions {
  /** Maximum number of reconnection attempts before giving up */
  maxReconnectAttempts?: number;
  /** Delay between reconnection attempts in milliseconds */
  reconnectDelay?: number;
  /** Timeout for request responses in milliseconds */
  requestTimeout?: number;
}

/**
 * Default configuration values for WebSocket connections
 */
export const DEFAULT_OPTIONS: WebSocketConnectionOptions = {
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  requestTimeout: 5000,
};

/**
 * Base class for managing WebSocket connections with built-in reconnection logic
 * and request/response handling. This class provides core functionality for
 * WebSocket communication including:
 * - Connection management
 * - Automatic reconnection
 * - Request/response handling with timeouts
 * - Error handling
 */
export abstract class WebSocketConnectionManager {
  protected ws: WebSocket | null = null;
  protected pendingRequests: Map<string, PendingRequest> = new Map();
  protected reconnectAttempts = 0;
  protected options: WebSocketConnectionOptions;

  /**
   * Creates a new WebSocketConnectionManager instance
   * @param options Configuration options for the WebSocket connection
   */
  constructor(options: WebSocketConnectionOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Sets up event handlers for a WebSocket connection
   * @param ws The WebSocket instance to set up handlers for
   */
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

  /**
   * Handles WebSocket disconnection events and attempts to reconnect
   * if within the maximum reconnection attempts limit
   */
  protected handleDisconnect() {
    // TODO: Remove this
    const t = 1;
    if (t === 1) return;
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

  /**
   * Clears all pending requests with an error
   * @param error The error to reject pending requests with
   */
  protected clearPendingRequests(error: Error) {
    this.pendingRequests.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingRequests.clear();
  }

  /**
   * Handles incoming WebSocket messages by routing them to appropriate handlers
   * @param message The received WebSocket message
   */
  protected handleMessage(message: WebSocketMessage) {
    if (message.messageType === 'response') {
      // This is a response to a request we sent
      this.handleResponse(message.id, message.payload);
    } else {
      // This is a new request that needs to be handled
      this.handleRequest(message);
    }
  }

  /**
   * Abstract method to handle incoming requests
   * Must be implemented by subclasses
   * @param message The received request message
   */
  protected abstract handleRequest(message: WebSocketMessage): void;

  /**
   * Abstract method to handle reconnection logic
   * Must be implemented by subclasses
   */
  protected abstract reconnect(): void;

  /**
   * Sends a request over the WebSocket connection and returns a promise
   * that resolves with the response or rejects on timeout/error
   * @param message The message to send
   * @param timeoutMs Optional timeout in milliseconds
   * @returns Promise that resolves with the response
   */
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

    console.log('\n Sending request');

    return new Promise((resolve, reject) => {
      console.log('\n\n Returning promise');
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timed out'));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.ws?.send(JSON.stringify(requestMessage));
    });
  }

  /**
   * Handles successful responses to requests
   * @param id The request ID
   * @param payload The response payload
   */
  protected handleResponse(id: string, payload: any) {
    console.log('\n\n XXXHandling response \n\n');
    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      console.warn(`Received response for unknown request ID: ${id}`);
      return;
    }

    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(id);
    pendingRequest.resolve(payload);
  }

  /**
   * Handles error responses to requests
   * @param id The request ID
   * @param error The error message
   */
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

  /**
   * Closes the WebSocket connection and cleans up pending requests
   */
  public close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clearPendingRequests(new Error('Connection closed by user'));
  }

  /**
   * Sends a response to a request over the WebSocket connection
   * @param requestId The ID of the original request
   * @param response The response message to send
   */
  protected sendResponse(requestId: string, response: any) {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    console.log('\n Sending response back');

    const responseMessage = {
      ...response,
      id: requestId,
      messageType: 'response' as const,
    };

    this.ws.send(JSON.stringify(responseMessage));
  }
}
