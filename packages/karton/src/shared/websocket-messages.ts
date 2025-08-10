import superjson from 'superjson';
import type { Patch } from 'immer';
import type {
  WebSocketMessage,
  RPCCallData,
  RPCReturnData,
  RPCExceptionData,
  StateSyncData,
  StatePatchData,
} from './types.js';

export function serializeMessage(message: WebSocketMessage): string {
  return superjson.stringify(message);
}

export function deserializeMessage(data: string): WebSocketMessage {
  const parsed = superjson.parse(data) as WebSocketMessage;

  if (!parsed.type) {
    throw new Error('Invalid WebSocket message: missing type');
  }

  if (!parsed.data) {
    throw new Error('Invalid WebSocket message: missing data');
  }

  return parsed;
}

export function createRPCCallMessage(
  rpcCallId: string,
  procedurePath: string[],
  parameters: any[],
): WebSocketMessage {
  return {
    type: 'rpc_call',
    data: {
      rpcCallId,
      procedurePath,
      parameters,
    } as RPCCallData,
  };
}

export function createRPCReturnMessage(
  rpcCallId: string,
  value: unknown,
): WebSocketMessage {
  return {
    type: 'rpc_return',
    data: {
      rpcCallId,
      value,
    } as RPCReturnData,
  };
}

export function createRPCExceptionMessage(
  rpcCallId: string,
  error: Error,
): WebSocketMessage {
  const serializedError = {
    ...error,
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  return {
    type: 'rpc_exception',
    data: {
      rpcCallId,
      error: serializedError as Error,
    } as RPCExceptionData,
  };
}

export function createStateSyncMessage(state: unknown): WebSocketMessage {
  return {
    type: 'state_sync',
    data: {
      state,
    } as StateSyncData,
  };
}

export function createStatePatchMessage(patch: Patch[]): WebSocketMessage {
  return {
    type: 'state_patch',
    data: {
      patch,
    } as StatePatchData,
  };
}

export function isRPCCallMessage(
  message: WebSocketMessage,
): message is WebSocketMessage & { data: RPCCallData } {
  return message.type === 'rpc_call';
}

export function isRPCReturnMessage(
  message: WebSocketMessage,
): message is WebSocketMessage & { data: RPCReturnData } {
  return message.type === 'rpc_return';
}

export function isRPCExceptionMessage(
  message: WebSocketMessage,
): message is WebSocketMessage & { data: RPCExceptionData } {
  return message.type === 'rpc_exception';
}

export function isStateSyncMessage(
  message: WebSocketMessage,
): message is WebSocketMessage & { data: StateSyncData } {
  return message.type === 'state_sync';
}

export function isStatePatchMessage(
  message: WebSocketMessage,
): message is WebSocketMessage & { data: StatePatchData } {
  return message.type === 'state_patch';
}
