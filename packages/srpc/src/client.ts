import { WebSocketRpcBridge, type WebSocketBridgeOptions } from './core';
import { WebSocket } from 'ws';
/**
 * Client implementation of the WebSocket RPC Bridge
 */
export class WebSocketRpcClient extends WebSocketRpcBridge {
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  /**
   * Creates a new WebSocketRpcClient
   * @param url WebSocket server URL
   * @param options Connection options
   */
  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(options);
    this.url = url;
  }

  /**
   * Connect to the WebSocket server
   * @returns Promise that resolves when connected
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);

        ws.onopen = () => {
          this.ws = ws;
          this.reconnectAttempts = 0;
          this.isIntentionalClose = false;
          this.setupWebSocketHandlers(ws);
          resolve();
        };

        ws.onerror = (event) => {
          reject(new Error('Failed to connect to WebSocket server'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Method to call a remote procedure on the server
   * @param method Method name
   * @param payload Request payload
   * @param onUpdate Optional callback for updates
   * @returns Promise resolving with the response
   */
  public call<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    if (!this.ws) {
      throw new Error('WebSocket is not connected. Call connect() first.');
    }
    return this.callMethod<TRequest, TResponse, TUpdate>(
      method,
      payload,
      onUpdate,
    );
  }

  /**
   * Reconnect to the WebSocket server
   */
  protected reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        console.log('Successfully reconnected to WebSocket server');
      } catch (error) {
        console.error('Failed to reconnect:', error);
        this.handleDisconnect();
      }
    }, this.options.reconnectDelay);
  }
}
