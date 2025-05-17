import { WebSocketRpcBridge, type WebSocketBridgeOptions } from './core';
import { ZodTypedBridge } from './zod-bridge';
import type { ZodBridgeContract } from './zod-contract';

/**
 * Extended WebSocketRpcBridge for client-side use
 */
class ClientBridge extends WebSocketRpcBridge {
  private url: string;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(options);
    this.url = url;
  }

  public call<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    return this.callMethod(method, payload, onUpdate);
  }

  protected reconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.reconnect(); // Try again
      }
    }, this.options.reconnectDelay);
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new window.WebSocket(this.url);

        ws.onopen = () => {
          this.ws = ws;
          this.setupWebSocketHandlers(ws);
          resolve();
        };

        ws.onerror = () => {
          reject(new Error('Failed to connect to WebSocket server'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }
}

/**
 * Zod-enabled client bridge
 */
export class ZodClient<C extends ZodBridgeContract> extends ZodTypedBridge<
  NonNullable<C['client']>,
  NonNullable<C['server']>,
  ClientBridge
> {
  constructor(url: string, contract: C, options?: WebSocketBridgeOptions) {
    super(new ClientBridge(url, options), {
      serves: contract.client || ({} as NonNullable<C['client']>),
      consumes: contract.server || ({} as NonNullable<C['server']>),
    });
  }

  public connect(): Promise<void> {
    return (this.bridge as ClientBridge).connect();
  }
}

/**
 * Helper function to create a Zod-enabled client bridge
 */
export function createSRPCClientBridge<C extends ZodBridgeContract>(
  url: string,
  contract: C,
  options?: WebSocketBridgeOptions,
): ZodClient<C> {
  return new ZodClient(url, contract, options);
}
