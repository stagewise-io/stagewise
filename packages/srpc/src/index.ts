// Core types and classes
export {
  WebSocketRpcBridge,
  type RpcMethodHandler,
  type RpcMethodDefinition,
  type RpcMethods,
  type WebSocketMessageType,
  type BaseWebSocketMessage,
  type RequestMessage,
  type ResponseMessage,
  type UpdateMessage,
  type ErrorMessage,
  type WebSocketMessage,
  type WebSocketBridgeOptions,
  type PendingRequest,
} from './core';

// Export server
export { WebSocketRpcServer } from './server';

// Export client
export { WebSocketRpcClient } from './client';

// Export type helpers
export {
  type BridgeContract,
  type RpcMethodContract,
  type MethodImplementations,
  type MethodCalls,
  TypedBridge,
  TypedServer,
  TypedClient,
  createSRPCServer,
  createSRPCClient,
} from './type-helpers';

// If there are any legacy types or utils needed
export * from './legacy.types';
export * from './legacy.utils';
