import { WebSocketServer } from 'ws';
import { WebSocketRpcBridge } from './core';
import type { Server } from 'node:http';
import type { WebSocket as NodeWebSocket } from 'ws';
import { ZodTypedBridge } from './zod-bridge';
import type { ZodBridgeContract } from './zod-contract';

/**
 * Extended WebSocketRpcBridge for server-side use
 */
class ServerBridge extends WebSocketRpcBridge {
  private wss: WebSocketServer;

  constructor(server: Server) {
    super();
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: NodeWebSocket) => {
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

      ws.on('close', () => {
        if (this.ws === ws) {
          this.ws = null;
        }
      });
    });
  }

  public call<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    return this.callMethod(method, payload, onUpdate);
  }

  // Server does not need to reconnect
  protected reconnect(): void {}

  public close(): Promise<void> {
    this.wss.close();
    return super.close();
  }
}

/**
 * Zod-enabled server bridge
 */
export class ZodServer<C extends ZodBridgeContract> extends ZodTypedBridge<
  NonNullable<C['server']>,
  NonNullable<C['client']>,
  ServerBridge
> {
  constructor(server: Server, contract: C) {
    super(new ServerBridge(server), {
      serves: contract.server || ({} as NonNullable<C['server']>),
      consumes: contract.client || ({} as NonNullable<C['client']>),
    });
  }
}

/**
 * Helper functions to create Zod-enabled bridges
 */
export function createSRPCServerBridge<C extends ZodBridgeContract>(
  server: Server,
  contract: C,
): ZodServer<C> {
  return new ZodServer(server, contract);
}
