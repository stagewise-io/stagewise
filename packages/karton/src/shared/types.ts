import type { Draft } from 'immer';
import type { Patch } from 'immer';
import type { WebSocketServer } from 'ws';

// Deep validation helpers to ensure `state` does not contain functions or generator-like types
type IsFunction<T> = T extends (...args: any[]) => any ? true : false;
type IsAsyncFunction<T> = T extends (...args: any[]) => Promise<any>
  ? true
  : false;
type IsGeneratorLikeObject<T> = T extends
  | Generator<any, any, any>
  | AsyncGenerator<any, any, any>
  | Iterator<any>
  | IterableIterator<any>
  ? true
  : false;

// Whitelisted leaf object types that may have method properties but are allowed in state
type AllowedLeafObject =
  | Date
  | Error
  | RegExp
  | ArrayBuffer
  | SharedArrayBuffer
  | DataView
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;
type IsAllowedLeafObject<T> = T extends AllowedLeafObject ? true : false;

// Depth helpers to avoid pathological recursion on complex lib types
type DecDepth<D extends number> = D extends 0
  ? 0
  : D extends 1
    ? 0
    : D extends 2
      ? 1
      : D extends 3
        ? 2
        : D extends 4
          ? 3
          : D extends 5
            ? 4
            : D extends 6
              ? 5
              : D extends 7
                ? 6
                : D extends 8
                  ? 7
                  : D extends 9
                    ? 8
                    : 9;

type NonSymbolKeys<T> = Exclude<keyof T, symbol>;

// Recursively checks whether a type contains any disallowed entries
type DeepHasFunctionTypes<T, D extends number = 6> = D extends 0 // Stop recursion when depth budget is exhausted
  ? false
  : // Disallow any function types directly
    IsFunction<T> extends true
    ? true
    : // Disallow generator-like objects and iterators
      IsGeneratorLikeObject<T> extends true
      ? true
      : // Handle arrays/tuples by checking their element types only
        T extends readonly unknown[]
        ? DeepHasFunctionTypes<T[number], DecDepth<D>>
        : // Recurse into objects, but allow specific leaf objects
          T extends object
          ? IsAllowedLeafObject<T> extends true
            ? false
            : // If the object only has symbol keys, do not recurse further
              NonSymbolKeys<T> extends never
              ? false
              : // For objects, check all non-symbol property types
                true extends {
                    [K in NonSymbolKeys<T>]-?: DeepHasFunctionTypes<
                      T[K],
                      DecDepth<D>
                    >;
                  }[NonSymbolKeys<T>]
                ? true
                : false
          : // Primitives are fine
            false;

// Recursively checks whether a type contains any disallowed entries (anything else than objects with async-functions)
type DeepHasNonFunctionTypes<T, D extends number = 6> = D extends 0 // Stop recursion when depth budget is exhausted
  ? false
  : // Allow async function leaves
    IsAsyncFunction<T> extends true
    ? false
    : // Explicitly reject synchronous functions
      IsFunction<T> extends true
      ? true
      : // Disallow arrays/tuples and common container types
        T extends Map<any, any> | Set<any> | WeakMap<any, any> | WeakSet<any>
        ? true
        : T extends readonly unknown[]
          ? true
          : // Recurse into objects; primitives are invalid
            T extends object
            ? NonSymbolKeys<T> extends never
              ? false
              : true extends {
                    [K in NonSymbolKeys<T>]-?: DeepHasNonFunctionTypes<
                      T[K],
                      DecDepth<D>
                    >;
                  }[NonSymbolKeys<T>]
                ? true
                : false
            : true;

// Returns true if T['state'] is valid (contains no functions/generators deeply)
type KartonStateIsValid<T> = T extends { state: infer S }
  ? DeepHasFunctionTypes<S> extends true
    ? false
    : true
  : false;

// If the state is invalid, require a phantom error property to force a type error at the usage site
type RequireValidState<S> = DeepHasFunctionTypes<S> extends true
  ? {
      __error_state_contains_functions_or_generators: 'Karton state must not contain functions or generator-like types';
    }
  : Record<never, never>;

type KartonClientProceduresAreValid<T> = T extends {
  clientProcedures: infer S;
}
  ? [S] extends [undefined]
    ? true
    : DeepHasNonFunctionTypes<Exclude<S, undefined>> extends true
      ? false
      : true
  : true;

type KartonServerProceduresAreValid<T> = T extends {
  serverProcedures: infer S;
}
  ? [S] extends [undefined]
    ? true
    : DeepHasNonFunctionTypes<Exclude<S, undefined>> extends true
      ? false
      : true
  : true;

// If the procedures are invalid, require a phantom error property to force a type error at the usage site
type RequireValidProcedures<S> = [S] extends [undefined]
  ? Record<never, never>
  : DeepHasNonFunctionTypes<Exclude<S, undefined>> extends true
    ? {
        __error_procedures_must_only_contain_async_functions: 'Karton procedures must only contain asynchronous functions';
      }
    : Record<never, never>;

export type AppType<
  T extends {
    state: any;
    serverProcedures: any;
    clientProcedures: any;
  } & RequireValidState<T['state']> &
    RequireValidProcedures<T['serverProcedures']> &
    RequireValidProcedures<T['clientProcedures']> = any,
> = KartonStateIsValid<T> extends true
  ? KartonClientProceduresAreValid<T> extends true
    ? KartonServerProceduresAreValid<T> extends true
      ? T
      : never
    : never
  : never;

export type KartonState<T> = T extends { state: infer S } ? S : never;

export type AsyncFunction = (...args: any[]) => Promise<any>;

export type ProcedureTree = {
  [key: string]: AsyncFunction | ProcedureTree;
};

export type ExtractProcedures<T> = T extends undefined
  ? Record<string, never>
  : T;

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
  : Record<string, never>;

export type KartonClientProcedures<T> = T extends { clientProcedures: infer P }
  ? ExtractProcedures<P>
  : Record<string, never>;

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
  procedures: KartonServerProcedureImplementations<T>;
  initialState: KartonState<T>;
}

export interface KartonServer<T> {
  state: Readonly<KartonState<T>>;
  setState: (recipe: (draft: Draft<KartonState<T>>) => void) => KartonState<T>;
  clientProcedures: KartonClientProceduresWithClientId<T>;
  connectedClients: ReadonlyArray<string>;
  wss: WebSocketServer;
}

export interface KartonClientConfig<T> {
  webSocketPath: string;
  procedures: KartonClientProcedureImplementations<T>;
  fallbackState: KartonState<T>;
  onStateChange?: () => void;
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
