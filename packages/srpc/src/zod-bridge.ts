import { WebSocketRpcBridge, type WebSocketBridgeOptions } from './core';
import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ZodBridgeContract,
  ZodEndpointMethodMap,
  ZodMethodCalls,
  ZodMethodImplementations,
  InferRequestType,
  InferResponseType,
  InferUpdateType,
} from './zod-contract';
import { validateWithZod } from './zod-contract';

/**
 * Base class for Zod-enabled bridges that adds schema validation
 */
export class ZodTypedBridge<
  Serves extends ZodEndpointMethodMap,
  Consumes extends ZodEndpointMethodMap,
  B extends WebSocketRpcBridge,
> {
  protected bridge: B;
  protected contract: {
    serves: Serves;
    consumes: Consumes;
  };
  public call: ZodMethodCalls<Consumes>;

  constructor(bridge: B, contract: { serves: Serves; consumes: Consumes }) {
    this.bridge = bridge;
    this.contract = contract;

    // Create a proxy for method calling with validation
    this.call = new Proxy({} as ZodMethodCalls<Consumes>, {
      get: (target, prop) => {
        return (request: any, options?: any) => {
          return this.callMethod(prop as keyof Consumes, request, options);
        };
      },
    });
  }

  private async callMethod<K extends keyof Consumes>(
    method: K,
    request: InferRequestType<Consumes[K]>,
    options?: { onUpdate?: (update: InferUpdateType<Consumes[K]>) => void },
  ): Promise<InferResponseType<Consumes[K]>> {
    const methodContract = this.contract.consumes[method];
    if (!methodContract) {
      throw new Error(`Method ${String(method)} not found in contract`);
    }

    // Validate request
    const validatedRequest = validateWithZod(
      methodContract.request,
      request,
      `request for method ${String(method)}`,
    );

    // Create update handler with validation if needed
    const onUpdate =
      options?.onUpdate && methodContract.update
        ? (update: unknown) => {
            if (!methodContract.update) return; // TypeScript check
            try {
              const validatedUpdate = validateWithZod(
                methodContract.update,
                update,
                `update for method ${String(method)}`,
                true, // silently log validation errors
              );
              options.onUpdate?.(validatedUpdate);
            } catch (error) {
              // Log validation error but don't throw
              console.error('Update validation failed:', error);
            }
          }
        : undefined;

    // Call method and validate response
    const response = await (this.bridge as any).callMethod(
      method as string,
      validatedRequest,
      onUpdate,
    );

    return validateWithZod(
      methodContract.response,
      response,
      `response for method ${String(method)}`,
    );
  }

  public register(implementations: ZodMethodImplementations<Serves>): void {
    const wrappedImplementations: Record<string, any> = {};

    for (const [method, implementation] of Object.entries(implementations)) {
      const methodContract = this.contract.serves[method as keyof Serves];
      if (!methodContract) {
        throw new Error(`Method ${method} not found in contract`);
      }

      wrappedImplementations[method] = async (
        request: unknown,
        sendUpdate?: (update: unknown) => void,
      ) => {
        // Validate incoming request
        const validatedRequest = validateWithZod(
          methodContract.request,
          request,
          `request for method ${method}`,
        );

        // Create update handler with validation if needed
        const wrappedSendUpdate =
          methodContract.update && sendUpdate
            ? (update: unknown) => {
                if (!methodContract.update) return; // TypeScript check
                try {
                  const validatedUpdate = validateWithZod(
                    methodContract.update,
                    update,
                    `update for method ${method}`,
                    true, // silently log validation errors
                  );
                  sendUpdate(validatedUpdate);
                } catch (error) {
                  // Log validation error but don't throw
                  console.error('Update validation failed:', error);
                }
              }
            : undefined;

        // Call implementation and validate response
        const response = await implementation(validatedRequest, {
          sendUpdate: wrappedSendUpdate as any,
        });

        return validateWithZod(
          methodContract.response,
          response,
          `response for method ${method}`,
        );
      };
    }

    this.bridge.register(wrappedImplementations);
  }

  public async close(): Promise<void> {
    await this.bridge.close();
  }
}

/**
 * Extended WebSocketRpcBridge for server-side use
 */
class ServerBridge extends WebSocketRpcBridge {
  private wss: WebSocketServer;

  constructor(server: Server) {
    super();
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
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

      console.log('WebSocket client connected');
    });
  }

  public call<TRequest, TResponse, TUpdate>(
    method: string,
    payload: TRequest,
    onUpdate?: (update: TUpdate) => void,
  ): Promise<TResponse> {
    return this.callMethod(method, payload, onUpdate);
  }

  protected reconnect(): void {
    throw new Error('Server does not support reconnection');
  }

  public close(): Promise<void> {
    this.wss.close();
    return super.close();
  }
}

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
        console.log('Successfully reconnected to WebSocket server');
      } catch (error) {
        console.error('Failed to reconnect:', error);
        this.reconnect(); // Try again
      }
    }, this.options.reconnectDelay);
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = new WebSocket(this.url);

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
 * Helper functions to create Zod-enabled bridges
 */
export function createSRPCServerBridge<C extends ZodBridgeContract>(
  server: Server,
  contract: C,
): ZodServer<C> {
  return new ZodServer(server, contract);
}

export function createSRPCClientBridge<C extends ZodBridgeContract>(
  url: string,
  contract: C,
  options?: WebSocketBridgeOptions,
): ZodClient<C> {
  return new ZodClient(url, contract, options);
}
