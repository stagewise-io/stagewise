import type { RPCCallOptions } from './rpc.js';
import type { ProcedureTree, AsyncFunction } from './types.js';

type CallFunction = (
  procedurePath: string[],
  parameters: any[],
  options?: RPCCallOptions,
) => Promise<unknown>;

export function createProcedureProxy(
  call: CallFunction,
  options?: RPCCallOptions,
  path: string[] = [],
): any {
  return new Proxy(() => {}, {
    get(_target, prop) {
      // Handle special properties
      if (prop === 'toString' || prop === 'valueOf') {
        return () => `[Proxy: ${path.join('.')}]`;
      }

      if (typeof prop === 'symbol') {
        return undefined;
      }

      const newPath = [...path, String(prop)];
      return createProcedureProxy(call, options, newPath);
    },

    apply(_target, _thisArg, args) {
      return call(path, args, options);
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

export function resolveProcedurePath(
  tree: ProcedureTree,
  path: string[],
): AsyncFunction | undefined {
  if (path.length === 0) {
    return undefined;
  }

  let current: any = tree;

  for (const segment of path) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === 'function' ? current : undefined;
}
