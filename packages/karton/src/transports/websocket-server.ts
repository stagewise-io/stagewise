import { WebSocketServer, type WebSocket } from 'ws';
import type { Transport, ServerTransport } from '../shared/transport.js';
import { WebSocketTransport } from './websocket-client.js';

export class WebSocketServerTransport implements ServerTransport {
  private wss: WebSocketServer;

  constructor(optionsOrWss: WebSocketServer | any) {
    // Check if it looks like a WebSocketServer instance (has 'on' method and 'clients' property)
    if (
      optionsOrWss instanceof WebSocketServer ||
      (optionsOrWss &&
        typeof optionsOrWss.on === 'function' &&
        optionsOrWss.clients)
    ) {
      this.wss = optionsOrWss;
    } else {
      this.wss = new WebSocketServer(optionsOrWss);
    }
  }

  onConnection(handler: (clientTransport: Transport) => void): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const transport = new WebSocketTransport(ws as any);
      handler(transport);
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get wssInstance(): WebSocketServer {
    return this.wss;
  }
}
