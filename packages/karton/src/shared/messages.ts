import type { Patch } from 'immer';
import type {
  Message,
  RPCCallData,
  RPCReturnData,
  RPCExceptionData,
  StateSyncData,
  StatePatchData,
} from './types';

export function createRPCCallMessage(
  rpcCallId: string,
  procedurePath: string,
  parameters: any[],
): Message {
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
): Message {
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
): Message {
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

export function createStateSyncMessage(state: unknown): Message {
  return {
    type: 'state_sync',
    data: {
      state,
    } as StateSyncData,
  };
}

export function createStatePatchMessage(patch: Patch[]): Message {
  return {
    type: 'state_patch',
    data: {
      patch,
    } as StatePatchData,
  };
}

export function isRPCCallMessage(
  message: Message,
): message is Message & { data: RPCCallData } {
  return message.type === 'rpc_call';
}

export function isRPCReturnMessage(
  message: Message,
): message is Message & { data: RPCReturnData } {
  return message.type === 'rpc_return';
}

export function isRPCExceptionMessage(
  message: Message,
): message is Message & { data: RPCExceptionData } {
  return message.type === 'rpc_exception';
}

export function isStateSyncMessage(
  message: Message,
): message is Message & { data: StateSyncData } {
  return message.type === 'state_sync';
}

export function isStatePatchMessage(
  message: Message,
): message is Message & { data: StatePatchData } {
  return message.type === 'state_patch';
}
