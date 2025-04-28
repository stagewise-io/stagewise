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
} from './src/core';

// Export server
export { WebSocketRpcServer } from './src/server';

// Export client
export { WebSocketRpcClient } from './src/client';

// Export type helpers
export {
  type BridgeContract,
  type RpcMethodContract,
  type MethodImplementations,
  type MethodCalls,
  TypedBridge,
  TypedServer,
  TypedClient,
  createSRPCServerBridge,
  createSRPCClientBridge,
  type CreateBridgeContract,
} from './src/type-helpers';
