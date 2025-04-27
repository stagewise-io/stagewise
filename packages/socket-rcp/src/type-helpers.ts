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
export type BridgeContract = {
  [methodName: string]: RpcMethodContract<any, any, any>;
};

// Type for method implementations
export type MethodImplementations<T extends BridgeContract> = {
  [K in keyof T]: (
    request: T[K]['request'],
    sendUpdate: (update: T[K]['update']) => void,
  ) => Promise<T[K]['response']>;
};

// Type for method calls
export type MethodCalls<T extends BridgeContract> = {
  [K in keyof T]: (
    request: T[K]['request'],
    onUpdate?: (update: T[K]['update']) => void,
  ) => Promise<T[K]['response']>;
};

// TypedBridge wraps WebSocketRpcClient or WebSocketRpcServer with type safety
export class TypedBridge<
  TServer extends BridgeContract,
  TClient extends BridgeContract,
  B extends WebSocketRpcClient | WebSocketRpcServer,
> {
  protected bridge: B;

  constructor(bridge: B) {
    this.bridge = bridge;
  }

  // Call a method with type safety
  public call<K extends keyof TClient>(
    method: K,
    request: TClient[K]['request'],
    onUpdate?: (update: TClient[K]['update']) => void,
  ): Promise<TClient[K]['response']> {
    return this.bridge.call(
      method as string,
      request,
      onUpdate as (update: any) => void,
    );
  }

  // Register methods with type safety
  public register(
    implementations: Partial<MethodImplementations<TServer>>,
  ): void {
    this.bridge.register(implementations as any);
  }
}

export class TypedServer<
  TServer extends BridgeContract,
  TClient extends BridgeContract,
> extends TypedBridge<TServer, TClient, WebSocketRpcServer> {
  constructor(server: Server) {
    super(new WebSocketRpcServer(server));
  }
}

export class TypedClient<
  TServer extends BridgeContract,
  TClient extends BridgeContract,
> extends TypedBridge<TServer, TClient, WebSocketRpcClient> {
  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(new WebSocketRpcClient(url, options));
  }
  public connect(): Promise<void> {
    return this.bridge.connect();
  }
}

// Helper functions to create typed bridges
export function createTypedServer<
  TServer extends BridgeContract,
  TClient extends BridgeContract,
>(server: Server): TypedServer<TServer, TClient> {
  return new TypedServer<TServer, TClient>(server);
}

export function createTypedClient<
  TServer extends BridgeContract,
  TClient extends BridgeContract,
>(
  url: string,
  options?: WebSocketBridgeOptions,
): TypedClient<TServer, TClient> {
  return new TypedClient<TServer, TClient>(url, options);
}
