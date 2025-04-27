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

// TypedBridge wraps WebSocketRpcClient or WebSocketRpcServer with type safety
export class TypedBridge<
  T extends BridgeContract,
  B extends WebSocketRpcClient | WebSocketRpcServer,
> {
  protected bridge: B;

  constructor(bridge: B) {
    this.bridge = bridge;
  }

  // Call a method with type safety
  public call<K extends keyof T>(
    method: K,
    request: T[K]['request'],
    onUpdate?: (update: T[K]['update']) => void,
  ): Promise<T[K]['response']> {
    return this.bridge.call(
      method as string,
      request,
      onUpdate as (update: any) => void,
    );
  }

  // Register methods with type safety
  public register(implementations: Partial<MethodImplementations<T>>): void {
    this.bridge.register(implementations as any);
  }
}

export class TypedServer<T extends BridgeContract> extends TypedBridge<
  T,
  WebSocketRpcServer
> {
  constructor(server: Server) {
    super(new WebSocketRpcServer(server));
  }
}

export class TypedClient<T extends BridgeContract> extends TypedBridge<
  T,
  WebSocketRpcClient
> {
  constructor(url: string, options?: WebSocketBridgeOptions) {
    super(new WebSocketRpcClient(url, options));
  }
  public connect(): Promise<void> {
    return this.bridge.connect();
  }
}

// Helper functions to create typed bridges
export function createTypedServer<T extends BridgeContract>(
  server: Server,
): TypedServer<T> {
  return new TypedServer<T>(server);
}

export function createTypedClient<T extends BridgeContract>(
  url: string,
  options?: WebSocketBridgeOptions,
): TypedClient<T> {
  return new TypedClient<T>(url, options);
}
