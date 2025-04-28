import { WebSocketRpcServer } from './server';
import { WebSocketRpcClient } from './client';
import type { Server } from 'node:http';
import type { WebSocketBridgeOptions } from './core';

/**
 * Type definitions for creating strongly-typed bridges
 */

// Define a bridge method contract
export interface RpcMethodContract<TRequest, TResponse, TUpdate = never> {
  request: TRequest;
  response: TResponse;
  update: TUpdate;
}

// Define a bridge contract with multiple methods
export type BridgeContract = Record<string, RpcMethodContract<any, any, any>>;

export type CreateBridgeContract<
  T extends Record<string, RpcMethodContract<any, any, any>> | null,
> = T extends null
  ? Record<string, never>
  : {
      [K in keyof T]: T[K] extends RpcMethodContract<any, any, any>
        ? T[K]
        : never;
    };

export type MethodImplementations<T> = {
  [K in keyof T]: T[K] extends RpcMethodContract<
    infer Req,
    infer Res,
    infer Upd
  >
    ? (request: Req, sendUpdate: (update: Upd) => void) => Promise<Res>
    : never;
};

// Type for method calls
export type MethodCalls<T> = {
  [K in keyof T]: T[K] extends RpcMethodContract<
    infer Req,
    infer Res,
    infer Upd
  >
    ? (request: Req, onUpdate?: (update: Upd) => void) => Promise<Res>
    : never;
};

// TypedBridge wraps WebSocketRpcClient or WebSocketRpcServer with type safety
export class TypedBridge<
  Serves extends BridgeContract,
  Consumes extends BridgeContract,
  B extends WebSocketRpcClient | WebSocketRpcServer,
> {
  protected bridge: B;
  public call: MethodCalls<Consumes>;

  constructor(bridge: B) {
    this.bridge = bridge;

    // Create a proxy for method calling
    this.call = new Proxy({} as MethodCalls<Consumes>, {
      get: (target, prop) => {
        return (request: any, onUpdate?: (update: any) => void) => {
          return this.callMethod(prop as keyof Consumes, request, onUpdate);
        };
      },
    });
  }

  // Private method to handle actual method calls
  private callMethod<K extends keyof Consumes>(
    method: K,
    request: Consumes[K]['request'],
    onUpdate?: (update: Consumes[K]['update']) => void,
  ): Promise<Consumes[K]['response']> {
    return this.bridge.call(
      method as string,
      request,
      onUpdate as (update: any) => void,
    );
  }

  // Register methods with type safety
  public register(implementations: MethodImplementations<Serves>): void {
    this.bridge.register(implementations);
  }
}

export class TypedServer<
  Serves extends BridgeContract,
  Consumes extends BridgeContract,
> extends TypedBridge<Serves, Consumes, WebSocketRpcServer> {
  constructor(server: Server) {
    super(new WebSocketRpcServer(server));
  }
}

export class TypedClient<
  Serves extends BridgeContract,
  Consumes extends BridgeContract,
> extends TypedBridge<Serves, Consumes, WebSocketRpcClient> {
  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(new WebSocketRpcClient(url, options));
  }
  public connect(): Promise<void> {
    return this.bridge.connect();
  }

  public close(): void {
    this.bridge.close();
  }
}

// Helper functions to create typed bridges
export function createSRPCServerBridge<
  Serves extends BridgeContract,
  Consumes extends BridgeContract,
>(server: Server): TypedServer<Serves, Consumes> {
  return new TypedServer<Serves, Consumes>(server);
}

export function createSRPCClientBridge<
  Serves extends BridgeContract,
  Consumes extends BridgeContract,
>(
  url: string,
  options?: WebSocketBridgeOptions,
): TypedClient<Serves, Consumes> {
  return new TypedClient<Serves, Consumes>(url, options);
}
