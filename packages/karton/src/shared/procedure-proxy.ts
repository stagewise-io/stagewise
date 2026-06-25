import type { RPCCallOptions } from './rpc.js';
import type { ProcedureTree, AsyncFunction } from './types.js';

type CallFunction = (
  procedurePath: string,
  parameters: any[],
  options?: RPCCallOptions,
) => Promise<unknown> | undefined;

export function createProcedureProxy(
  call: CallFunction,
  path?: string,
  options?: RPCCallOptions,
): any {
  // Cache child proxies by property name so that repeated property
  // accesses return the same reference. Without this, every render
  // that calls a selector like `(p) => p.toolbox.getWorkspaceDiffSummary`
  // produces a brand-new Proxy, breaking useMemo/useEffect dependency
  // checks and causing infinite render loops.
  const childCache = new Map<string | symbol, any>();
  // Cache for .withTimeout(ms) results, keyed by timeout duration.
  // This ensures repeated calls like `proc.withTimeout(310_000)` return
  // the same proxy reference, preserving useMemo/useCallback stability.
  const timeoutCache = new Map<number, any>();

  return new Proxy(() => {}, {
    get(_target, prop) {
      // Handle special properties
      if (prop === 'toString' || prop === 'valueOf') {
        return () => `[Proxy: ${path}]`;
      }

      if (typeof prop === 'symbol') {
        return undefined;
      }

      const cached = childCache.get(prop);
      if (cached !== undefined) return cached;

      let child: any;

      // .fire returns a proxy variant that uses fire-and-forget
      if (prop === 'fire') {
        child = createProcedureProxy(call, path, {
          ...options,
          fireAndForget: true,
        });
      } else if (prop === 'withTimeout') {
        // .withTimeout(ms) returns a proxy variant with a custom RPC timeout.
        // Called as: procedure.withTimeout(60_000)(args)
        // Results are cached per-ms so repeated calls return stable references.
        child = (ms: number) => {
          const existing = timeoutCache.get(ms);
          if (existing !== undefined) return existing;
          const proxied = createProcedureProxy(call, path, {
            ...options,
            timeout: ms,
          });
          timeoutCache.set(ms, proxied);
          return proxied;
        };
      } else {
        const newPath = path ? `${path}.${String(prop)}` : String(prop);
        child = createProcedureProxy(call, newPath, options);
      }

      childCache.set(prop, child);
      return child;
    },

    apply(_target, _thisArg, args) {
      return call(path ?? '', args, options);
    },
  });
}

export function extractProceduresFromTree(
  tree: ProcedureTree | undefined,
  prefix: string[] = [],
): Map<string, AsyncFunction> {
  const procedures = new Map<string, AsyncFunction>();

  if (!tree) {
    return procedures;
  }

  for (const [key, value] of Object.entries(tree)) {
    const currentPath = [...prefix, key];

    if (typeof value === 'function') {
      procedures.set(currentPath.join('.'), value as AsyncFunction);
    } else if (typeof value === 'object' && value !== null) {
      const nested = extractProceduresFromTree(
        value as ProcedureTree,
        currentPath,
      );
      for (const [nestedKey, nestedValue] of nested) {
        procedures.set(nestedKey, nestedValue);
      }
    }
  }

  return procedures;
}
