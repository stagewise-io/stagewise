import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { WebSocketRpcBridge } from './core';

/**
 * Server implementation of the WebSocket RPC Bridge
 */
export class WebSocketRpcServer extends WebSocketRpcBridge {
  private wss: WebSocketServer;

  /**
   * Creates a new WebSocketRpcServer
   * @param server HTTP server to attach to
   */
  constructor(server: Server) {
    super();
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      // If there's an existing connection, close it first
      if (this.ws) {
        console.warn(
          'New WebSocket connection attempted while one is already active. Closing existing connection first.',
        );
        const oldWs = this.ws;
        this.ws = null;
        oldWs.close();
      }

      this.ws = ws;
      this.setupWebSocketHandlers(ws);

      // Add cleanup handler when connection closes
      ws.on('close', () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      });

      console.log('WebSocket client connected');
    });
  }

  /**
   * Method to call a remote procedure on the client
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
    return this.callMethod<TRequest, TResponse, TUpdate>(
      method,
      payload,
      onUpdate,
    );
  }

  /**
   * Server doesn't need to reconnect
   */
  protected reconnect(): void {
    throw new Error('Server WebSocket manager does not support reconnection');
  }

  /**
   * Close the WebSocket server
   */
  public async close(): Promise<void> {
    await super.close();
    this.wss.close();
  }
}
