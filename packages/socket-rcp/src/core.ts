import type { WebSocket, ErrorEvent } from 'ws';
// Core type definitions
export type RpcMethodHandler<TRequest, TResponse, TUpdate> = (
  request: TRequest,
  sendUpdate: (update: TUpdate) => void,
) => Promise<TResponse>;

export interface RpcMethodDefinition<TRequest, TResponse, TUpdate> {
  handler: RpcMethodHandler<TRequest, TResponse, TUpdate>;
}

export type RpcMethods = Record<string, RpcMethodDefinition<any, any, any>>;

// Message types for the WebSocket communication
export type WebSocketMessageType = 'request' | 'response' | 'update' | 'error';

export interface BaseWebSocketMessage {
  id: string;
  messageType: WebSocketMessageType;
  method?: string;
}

export interface RequestMessage<T = any> extends BaseWebSocketMessage {
  messageType: 'request';
  method: string;
  payload: T;
}

export interface ResponseMessage<T = any> extends BaseWebSocketMessage {
  messageType: 'response';
  method: string;
  payload: T;
}

export interface UpdateMessage<T = any> extends BaseWebSocketMessage {
  messageType: 'update';
  method: string;
  payload: T;
}

export interface ErrorMessage extends BaseWebSocketMessage {
  messageType: 'error';
  error: {
    message: string;
    code?: string;
  };
}

export type WebSocketMessage<T = any> =
  | RequestMessage<T>
  | ResponseMessage<T>
  | UpdateMessage<T>
  | ErrorMessage;

// Bridge options
export interface WebSocketBridgeOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  requestTimeout?: number;
}

// Default options
export const DEFAULT_OPTIONS: WebSocketBridgeOptions = {
  maxReconnectAttempts: 5,
  reconnectDelay: 1000,
  requestTimeout: 30000, // Extended timeout for longer operations
};

// Pending request tracking
export interface PendingRequest<TResponse = any, TUpdate = any> {
  resolve: (value: TResponse) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
  onUpdate?: (update: TUpdate) => void;
}

/**
 * Base class for the WebSocket RPC Bridge that handles bidirectional
 * method registration and invocation with support for streaming updates
 */
export abstract class WebSocketRpcBridge {
  protected ws: WebSocket | null = null;
  protected pendingRequests: Map<string, PendingRequest> = new Map();
  protected reconnectAttempts = 0;
  protected options: WebSocketBridgeOptions;
  protected methods: RpcMethods = {};

  constructor(options: WebSocketBridgeOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Register RPC method handlers
   * @param methodHandlers Object containing method handlers
   */
  public register<T extends Record<string, RpcMethodHandler<any, any, any>>>(
    methodHandlers: T,
  ): void {
    Object.entries(methodHandlers).forEach(([methodName, handler]) => {
      this.methods[methodName] = { handler };
    });
  }

  /**
   * Generic method to call a remote procedure with support for streaming updates
   * @param method Method name to call
   * @param payload Request payload
   * @param onUpdate Optional callback for progress updates
   * @returns Promise resolving with the response
   */
  protected callMethod<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const id = crypto.randomUUID();
    const requestMessage: RequestMessage<TRequest> = {
      id,
      messageType: 'request',
      method,
      payload,
    };

    return new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, this.options.requestTimeout!);

      this.pendingRequests.set(id, { resolve, reject, timeout, onUpdate });
      this.ws?.send(JSON.stringify(requestMessage));
    });
  }

  /**
   * Sets up WebSocket event handlers
   * @param ws WebSocket instance
   */
  protected setupWebSocketHandlers(ws: WebSocket): void {
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        this.handleMessage(message);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.handleDisconnect();
    };

    ws.onerror = (event: ErrorEvent) => {
      console.error('WebSocket error:', event);
    };
  }

  /**
   * Handles incoming WebSocket messages
   * @param message The message to handle
   */
  protected handleMessage(message: WebSocketMessage): void {
    const { messageType, id } = message;

    switch (messageType) {
      case 'request':
        this.handleRequest(message as RequestMessage);
        break;
      case 'response':
        this.handleResponse(id, (message as ResponseMessage).payload);
        break;
      case 'update':
        this.handleUpdate(id, (message as UpdateMessage).payload);
        break;
      case 'error':
        this.handleError(id, (message as ErrorMessage).error.message);
        break;
      default:
        console.warn(`Unknown message type: ${messageType}`);
    }
  }

  /**
   * Handle incoming requests by invoking the registered method
   * @param message Request message
   */
  protected async handleRequest(message: RequestMessage): Promise<void> {
    const { id, method, payload } = message;

    if (!method) {
      this.sendError(id, 'Method name is required');
      return;
    }

    const methodDef = this.methods[method];
    if (!methodDef) {
      this.sendError(id, `Method not found: ${method}`);
      return;
    }

    try {
      // Create a function to send updates back to the caller
      const sendUpdate = (update: any) => {
        this.sendUpdate(id, method, update);
      };

      // Call the handler with the payload and update function
      const result = await methodDef.handler(payload, sendUpdate);

      // Send the final result
      this.sendResponse(id, method, result);
    } catch (error) {
      this.sendError(
        id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Handle response messages by resolving the pending request
   * @param id Request ID
   * @param payload Response payload
   */
  protected handleResponse(id: string, payload: any): void {
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
   * Handle update messages by calling the update callback
   * @param id Request ID
   * @param payload Update payload
   */
  protected handleUpdate(id: string, payload: any): void {
    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest || !pendingRequest.onUpdate) {
      console.warn(`Received update for unknown request ID: ${id}`);
      return;
    }

    pendingRequest.onUpdate(payload);
  }

  /**
   * Handle error messages by rejecting the pending request
   * @param id Request ID
   * @param error Error message
   */
  protected handleError(id: string, error: string): void {
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
   * Send a response message
   * @param id Request ID
   * @param method Method name
   * @param payload Response payload
   */
  protected sendResponse(id: string, method: string, payload: any): void {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const responseMessage: ResponseMessage = {
      id,
      messageType: 'response',
      method,
      payload,
    };

    this.ws.send(JSON.stringify(responseMessage));
  }

  /**
   * Send an update message for streaming
   * @param id Request ID
   * @param method Method name
   * @param payload Update payload
   */
  protected sendUpdate(id: string, method: string, payload: any): void {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const updateMessage: UpdateMessage = {
      id,
      messageType: 'update',
      method,
      payload,
    };

    this.ws.send(JSON.stringify(updateMessage));
  }

  /**
   * Send an error message
   * @param id Request ID
   * @param errorMessage Error message
   */
  protected sendError(id: string, errorMessage: string): void {
    if (!this.ws) {
      throw new Error('WebSocket is not connected');
    }

    const errorResponse: ErrorMessage = {
      id,
      messageType: 'error',
      error: {
        message: errorMessage,
      },
    };

    this.ws.send(JSON.stringify(errorResponse));
  }

  /**
   * Handle disconnection by attempting to reconnect
   */
  protected handleDisconnect(): void {
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
   * Clear all pending requests with an error
   * @param error Error to reject with
   */
  protected clearPendingRequests(error: Error): void {
    this.pendingRequests.forEach(({ reject }) => {
      reject(error);
    });
    this.pendingRequests.clear();
  }

  /**
   * Abstract method for reconnection logic
   */
  protected abstract reconnect(): void;

  /**
   * Close the WebSocket connection
   */
  public close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.clearPendingRequests(new Error('Connection closed by user'));
  }
}
