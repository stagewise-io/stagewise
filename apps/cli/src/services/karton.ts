import {
  createKartonServer,
  type KartonServer,
  type KartonServerProcedureImplementations,
} from '@stagewise/karton/server';
import type { KartonContract } from '@stagewise/karton-contract';

// --- Utility types to build typed dot-paths to async functions in server procedures ---
type StringKeyOf<T> = Extract<keyof T, string>;

type DotPathToAsyncFunctions<T> = T extends object
  ? {
      [K in StringKeyOf<T>]: T[K] extends (...args: any[]) => Promise<any>
        ? `${K}`
        : T[K] extends object
          ? `${K}.${DotPathToAsyncFunctions<T[K]>}`
          : never;
    }[StringKeyOf<T>]
  : never;

type Split<
  S extends string,
  D extends string,
> = S extends `${infer T}${D}${infer U}` ? [T, ...Split<U, D>] : [S];

type GetAtPath<T, Segments extends readonly string[]> = Segments extends [
  infer H,
  ...infer R,
]
  ? H extends keyof T
    ? GetAtPath<T[H], Extract<R, readonly string[]>>
    : never
  : T;

type FunctionAtDotPath<T, P extends string> = GetAtPath<T, Split<P, '.'>>;

/**
 * The Karton service is responsible for managing the connection to the UI (web app).
 */
export class KartonService {
  // @ts-expect-error - We initialize the karton server in the initialize method.
  private kartonServer: KartonServer<KartonContract>;
  private serverProcedureCallbacks: Map<string, Set<(...args: any[]) => void>> =
    new Map();

  private constructor() {}

  private async initialize(
    procedures: KartonServerProcedureImplementations<KartonContract>,
    initialState?: KartonContract['state'],
  ) {
    const wrappedProcedures = this.wrapServerProcedures(procedures);

    this.kartonServer = await createKartonServer<KartonContract>({
      procedures: wrappedProcedures,
      initialState: initialState ?? this.createDefaultInitialState(),
    });
  }

  public static async create(
    procedures: KartonServerProcedureImplementations<KartonContract>,
    initialState?: KartonContract['state'],
  ): Promise<KartonService> {
    const instance = new KartonService();
    await instance.initialize(procedures, initialState);
    return instance;
  }

  get webSocketServer() {
    return this.kartonServer.wss;
  }

  get clientProcedures() {
    return this.kartonServer.clientProcedures;
  }

  get state() {
    return this.kartonServer.state;
  }

  get setState() {
    return this.kartonServer.setState;
  }

  // --- Typed callback registration API ---
  public onServerProcedureCall<
    P extends DotPathToAsyncFunctions<KartonContract['serverProcedures']>,
  >(
    path: P,
    callback: (
      ...args: Parameters<
        FunctionAtDotPath<KartonContract['serverProcedures'], P>
      >
    ) => void,
  ): () => void {
    const key = String(path);
    let set = this.serverProcedureCallbacks.get(key);
    if (!set) {
      set = new Set();
      this.serverProcedureCallbacks.set(key, set);
    }
    set.add(callback as any);
    return () => this.offServerProcedureCall(path, callback as any);
  }

  public offServerProcedureCall<
    P extends DotPathToAsyncFunctions<KartonContract['serverProcedures']>,
  >(
    path: P,
    callback: (
      ...args: Parameters<
        FunctionAtDotPath<KartonContract['serverProcedures'], P>
      >
    ) => void,
  ): void {
    const key = String(path);
    const set = this.serverProcedureCallbacks.get(key);
    if (!set) return;
    set.delete(callback as any);
    if (set.size === 0) {
      this.serverProcedureCallbacks.delete(key);
    }
  }

  // --- Internal helpers ---
  private invokeCallbacks(pathKey: string, args: any[]): void {
    const set = this.serverProcedureCallbacks.get(pathKey);
    if (!set || set.size === 0) return;
    for (const cb of set) {
      try {
        cb(...args);
      } catch {}
    }
  }

  private wrapServerProcedures(
    procedures: KartonServerProcedureImplementations<KartonContract>,
  ): KartonServerProcedureImplementations<KartonContract> {
    const wrapTree = (obj: any, prefix: string[] = []): any => {
      const out: any = {};
      for (const [key, value] of Object.entries(obj ?? {})) {
        const path = [...prefix, key];
        if (typeof value === 'function') {
          out[key] = async (...args: any[]) => {
            const callingClientId = args[args.length - 1];
            const originalArgs = args.slice(0, -1);
            this.invokeCallbacks(path.join('.'), originalArgs);
            return await (value as any)(...originalArgs, callingClientId);
          };
        } else if (value && typeof value === 'object') {
          out[key] = wrapTree(value, path);
        }
      }
      return out;
    };

    return wrapTree(procedures);
  }

  private createDefaultInitialState(): KartonContract['state'] {
    return {
      activeChatId: null,
      workspacePath: null,
      chats: {},
      toolCallApprovalRequests: [],
      isWorking: false,
      subscription: undefined,
      authStatus: {
        isAuthenticated: false,
      },
      serverInfo: {
        port: 0,
        url: '',
      },
      workspaceInfo: {
        path: '',
        devAppPort: 0,
        loadedPlugins: [],
      },
      currentWorkspacePath: null,
    };
  }
}
