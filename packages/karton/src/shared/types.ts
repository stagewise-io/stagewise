import type { Draft } from 'immer';
import type { Patch } from 'immer';

export interface AppType<
  T extends {
    state: any;
    serverProcedures?: any;
    clientProcedures?: any;
  } = any,
> {
  state: T['state'];
  serverProcedures?: T['serverProcedures'];
  clientProcedures?: T['clientProcedures'];
}

export type KartonState<T> = T extends { state: infer S } ? S : never;

export type AsyncFunction = (...args: any[]) => Promise<any>;

export type ProcedureTree = {
  [key: string]: AsyncFunction | ProcedureTree;
};

export type ExtractProcedures<T> = T extends undefined ? {} : T;

export type AddClientIdToFunction<T> = T extends (...args: infer P) => infer R
  ? (...args: [...P, callingClientId: string]) => R
  : never;

export type AddClientIdToImplementations<T> = T extends AsyncFunction
  ? AddClientIdToFunction<T>
  : T extends ProcedureTree
    ? {
        [K in keyof T]: AddClientIdToImplementations<T[K]>;
      }
    : never;

export type KartonServerProcedures<T> = T extends { serverProcedures: infer P }
  ? ExtractProcedures<P>
  : {};

export type KartonClientProcedures<T> = T extends { clientProcedures: infer P }
  ? ExtractProcedures<P>
  : {};

export type KartonServerProcedureImplementations<T> =
  AddClientIdToImplementations<KartonServerProcedures<T>>;

export type KartonClientProcedureImplementations<T> = KartonClientProcedures<T>;

export type AddClientIdToCalls<T> = T extends AsyncFunction
  ? (clientId: string, ...args: Parameters<T>) => ReturnType<T>
  : T extends ProcedureTree
    ? {
        [K in keyof T]: AddClientIdToCalls<T[K]>;
      }
    : never;

export type KartonClientProceduresWithClientId<T> = AddClientIdToCalls<
  KartonClientProcedures<T>
>;

export enum KartonRPCErrorReason {
  CONNECTION_LOST = 'CONNECTION_LOST',
  CLIENT_NOT_FOUND = 'CLIENT_NOT_FOUND',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
}

export class KartonRPCException extends Error {
  public readonly reason: KartonRPCErrorReason;
  public readonly procedurePath: string[];
  public readonly clientId?: string;

  constructor(
    reason: KartonRPCErrorReason,
    procedurePath: string[],
    clientId?: string,
  ) {
    const procedureName = procedurePath.join('.');
    let message: string;

    switch (reason) {
      case KartonRPCErrorReason.CONNECTION_LOST:
        message = `RPC call to '${procedureName}' failed: Connection lost`;
        break;
      case KartonRPCErrorReason.CLIENT_NOT_FOUND:
        message = `RPC call to '${procedureName}' failed: Client '${clientId}' not found`;
        break;
      case KartonRPCErrorReason.SERVER_UNAVAILABLE:
        message = `RPC call to '${procedureName}' failed: Server unavailable`;
        break;
    }

    super(message);
    this.name = 'KartonRPCException';
    this.reason = reason;
    this.procedurePath = procedurePath;
    this.clientId = clientId;
  }
}

export interface RPCCallData {
  rpcCallId: string;
  procedurePath: string[];
  parameters: any[];
}

export interface RPCReturnData {
  rpcCallId: string;
  value: unknown;
}

export interface RPCExceptionData {
  rpcCallId: string;
  error: Error;
}

export interface StateSyncData {
  state: unknown;
}

export interface StatePatchData {
  patch: Patch[];
}

export type WebSocketMessageType =
  | 'rpc_call'
  | 'rpc_return'
  | 'rpc_exception'
  | 'state_sync'
  | 'state_patch';

export type WebSocketMessageData =
  | RPCCallData
  | RPCReturnData
  | RPCExceptionData
  | StateSyncData
  | StatePatchData;

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: WebSocketMessageData;
}

export interface KartonServerConfig<T> {
  expressApp: any;
  httpServer: any;
  webSocketPath: string;
  procedures: KartonServerProcedureImplementations<T>;
  initialState: KartonState<T>;
}

export interface KartonServer<T> {
  state: Readonly<KartonState<T>>;
  setState: (recipe: (draft: Draft<KartonState<T>>) => void) => KartonState<T>;
  clientProcedures: KartonClientProceduresWithClientId<T>;
  connectedClients: ReadonlyArray<string>;
}

export interface KartonClientConfig<T> {
  webSocketPath: string;
  procedures: KartonClientProcedureImplementations<T>;
  fallbackState: KartonState<T>;
}

export interface KartonClient<T> {
  state: Readonly<KartonState<T>>;
  serverProcedures: KartonServerProcedures<T>;
  isConnected: boolean;
}

export type CreateKartonServer = <T>(
  config: KartonServerConfig<T>,
) => Promise<KartonServer<T>>;

export type CreateKartonClient = <T>(
  config: KartonClientConfig<T>,
) => KartonClient<T>;
