import vm from 'node:vm';
import { createWorkerIPC, NON_WORKSPACE_PREFIXES } from './ipc';
import type { MountDescriptor } from './ipc';
import { createIsolatedFs } from './utils/isolated-fs';
import {
  createCredentialFetch,
  type SecretMapEntry,
} from './utils/credential-fetch';
import type { Attachment } from '@shared/karton-contracts/ui/agent/metadata';

const contexts = new Map<string, vm.Context>();
/** Per-agent cache of URL-imported modules (resolved via data: URL imports). */
const urlModuleCaches = new Map<string, Map<string, any>>();
const pendingCdp = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
>();

/**
 * Pending API.createAttachment() requests waiting for main-process blob-write.
 * Key = request id.
 */
const pendingCreateAttachment = new Map<
  string,
  {
    agentId: string;
    originalFileName: string;
    resolve: (fileName: string) => void;
    reject: (reason: unknown) => void;
  }
>();

const pendingCredential = new Map<
  string,
  {
    agentId: string;
    resolve: (value: Record<string, string> | null) => void;
    reject: (reason: unknown) => void;
  }
>();
const ipc = createWorkerIPC();

/** Per-agent mount descriptors, updated via `update-mounts` IPC. */
const agentMounts = new Map<string, MountDescriptor[]>();

/**
 * Per-agent accumulated secret maps (placeholder -> value + allowed origins).
 * Populated by `API.getCredential()` responses and consumed by the
 * fetch proxy to perform origin-gated substitution at network time.
 */
const agentSecretMaps = new Map<string, Map<string, SecretMapEntry>>();

/** Per-agent isolated fs instances, recreated when mounts change. */
const agentIsolatedFs = new Map<
  string,
  { fs: Record<string, any>; fsPromises: Record<string, any> }
>();

/**
 * Per-agent collection of file attachments accumulated during the current
 * script execution via `API.createAttachment()`.
 * Cleared before each execution and drained into the IPC result message.
 */
const pendingMultimodalAttachments = new Map<string, Attachment[]>();

/**
 * Per-agent collection of stringified outputs accumulated during the current
 * script execution via `API.output()`.
 * Cleared before each execution and drained into the IPC result message.
 */
const pendingOutputs = new Map<string, string[]>();

/**
 * Per-agent callback to reset the soft async timeout.
 * Set before each execution, invoked by `API.output()` / `API.createAttachment()`,
 * and cleared when execution finishes.
 */
const timerResetCallbacks = new Map<string, () => void>();

/** Node.js built-in modules safe to expose (computational, no I/O). */
const ALLOWED_NODE_MODULES = new Set([
  'buffer',
  'crypto',
  'events',
  'path',
  'querystring',
  'stream',
  'string_decoder',
  'url',
  'util',
  'zlib',
  'assert',
]);

/**
 * Modules that are provided as sandboxed/isolated versions rather than
 * the real Node.js built-in. Resolved via the `require()` shim.
 */
const SANDBOXED_NODE_MODULES = new Set(['fs', 'fs/promises']);

/** Node.js built-in modules that must be blocked for sandbox security. */
const BLOCKED_NODE_MODULES = new Set([
  'net',
  'http',
  'https',
  'http2',
  'child_process',
  'cluster',
  'dgram',
  'tls',
  'dns',
  'worker_threads',
  'vm',
  'process',
  'os',
  'v8',
  'inspector',
  'readline',
  'repl',
  'tty',
]);

/**
 * Pre-imported Node.js built-in modules. Populated once at worker startup
 * so that the synchronous `require()` shim can return them instantly.
 */
const preloadedModules = new Map<string, any>();

async function preloadAllowedModules() {
  for (const name of ALLOWED_NODE_MODULES)
    preloadedModules.set(name, await import(`node:${name}`));
}

/**
 * Fetch an ESM module from a URL (e.g. esm.sh), evaluate it in the worker
 * process via a data: URL import, and return the module namespace object.
 *
 * esm.sh entry points are thin wrappers that re-export from a versioned
 * bundle path (e.g. `export * from "/pkg@1.0.0/node/pkg.bundle.mjs"`).
 * We detect these wrappers, resolve the target URL, and fetch the actual
 * self-contained bundle before importing via data: URL.
 */
async function importFromUrl(
  url: string,
  cache: Map<string, any>,
): Promise<any> {
  const cached = cache.get(url);
  if (cached) return cached;

  const source = await fetchResolvedSource(url);
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  const mod = await import(dataUrl);
  cache.set(url, mod);
  return mod;
}

/**
 * Fetch ESM source from a URL, following esm.sh redirect wrappers.
 * esm.sh entry points are typically 1-3 lines of re-exports pointing to
 * the actual bundle. We detect these, resolve the paths against the
 * original URL, and fetch the real bundle instead.
 */
async function fetchResolvedSource(url: string, depth = 0): Promise<string> {
  if (depth > 5) throw new Error(`Too many redirects resolving module: ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch module: ${url} (HTTP ${response.status})`);
  }

  const source = await response.text();

  // Strip comments, then check if all remaining lines are just re-exports.
  // esm.sh wrappers look like:
  //   export * from "/pkg@1.0.0/node/pkg.bundle.mjs";
  //   export { default } from "/pkg@1.0.0/node/pkg.bundle.mjs";
  const codeLines = source
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l && !l.startsWith('/*') && !l.startsWith('*') && !l.startsWith('//'),
    );

  if (codeLines.length > 0 && codeLines.length <= 5) {
    const reExportPattern =
      /^export\s+(?:\*|{[^}]*})\s+from\s+["']([^"']+)["']\s*;?\s*$/;
    const targets = codeLines.map((l) => reExportPattern.exec(l));

    if (targets.every((m) => m !== null)) {
      // All code lines are re-exports — follow the first target
      // (they typically all point to the same base module)
      const targetPath = targets[0]![1];
      const resolvedUrl = new URL(targetPath, url).href;
      return fetchResolvedSource(resolvedUrl, depth + 1);
    }
  }

  return source;
}

/**
 * Ensure esm.sh URLs include `?bundle` so sub-modules are inlined,
 * and add `?target=node` if no target is specified.
 */
function ensureBundleParam(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'esm.sh') {
      if (
        !u.searchParams.has('bundle') &&
        !u.searchParams.has('raw') &&
        !u.searchParams.has('standalone')
      ) {
        u.searchParams.set('bundle', '');
      }
    }
    return u.href;
  } catch {
    return url;
  }
}

let cdpReqId = 0;
let credReqId = 0;
let appReqId = 0;

const pendingAppRequests = new Map<
  string,
  { resolve: () => void; reject: (reason: unknown) => void }
>();

const pendingSendMessage = new Map<
  string,
  { resolve: () => void; reject: (reason: unknown) => void }
>();

/**
 * Per-agent message listeners keyed by "appId\0pluginId" (pluginId may be empty).
 * Each key maps to an array of callbacks registered via API.onMessage().
 */
const agentMessageListeners = new Map<
  string,
  Map<string, Array<(data: unknown) => void>>
>();

/**
 * Per-agent CDP event listeners keyed by "tabId\0event".
 * Each key maps to a set of callbacks registered via API.onCDPEvent().
 */
const agentCdpListeners = new Map<
  string,
  Map<string, Set<(params: unknown) => void>>
>();

function messageListenerKey(appId: string, pluginId?: string): string {
  return `${appId}\0${pluginId ?? ''}`;
}

/**
 * Create or update the isolated fs instances for an agent based on its
 * current mounts.
 */
function refreshIsolatedFs(agentId: string) {
  const mounts = agentMounts.get(agentId) ?? [];
  const nonWorkspaceMounts = mounts.filter((m) =>
    NON_WORKSPACE_PREFIXES.has(m.prefix),
  );

  const notifyDiff = (
    absolutePath: string,
    before: string | null,
    after: string | null,
    isExternal: boolean,
    bytesWritten: number,
  ) => {
    if (nonWorkspaceMounts.some((m) => absolutePath.startsWith(m.absolutePath)))
      return;
    ipc.send({
      type: 'file-diff-notification',
      agentId,
      absolutePath,
      before,
      after,
      isExternal,
      bytesWritten,
    });
  };

  const { isolatedFs, isolatedFsPromises } = createIsolatedFs(
    mounts,
    notifyDiff,
  );
  agentIsolatedFs.set(agentId, {
    fs: isolatedFs,
    fsPromises: isolatedFsPromises,
  });
}

function getSandboxAPI(agentId: string) {
  return {
    sendCDP(tabId: string, method: string, params?: any) {
      const id = `${cdpReqId++}`;
      return new Promise((resolve, reject) => {
        pendingCdp.set(id, { resolve, reject });
        ipc.send({ type: 'cdp', id, tabId, method, params });
      });
    },
    onCDPEvent(
      tabId: string,
      event: string,
      callback: (params: unknown) => void,
    ): () => void {
      if (!agentCdpListeners.has(agentId)) {
        agentCdpListeners.set(agentId, new Map());
      }
      const listeners = agentCdpListeners.get(agentId)!;
      const key = `${tabId}\0${event}`;
      const isFirst = !listeners.has(key) || listeners.get(key)!.size === 0;

      if (!listeners.has(key)) listeners.set(key, new Set());

      listeners.get(key)!.add(callback);

      if (isFirst) {
        ipc.send({
          type: 'subscribe-cdp-event',
          agentId,
          tabId,
          event,
        });
      }

      return () => {
        const cbs = listeners.get(key);
        if (!cbs) return;
        cbs.delete(callback);
        if (cbs.size === 0) {
          listeners.delete(key);
          ipc.send({
            type: 'unsubscribe-cdp-event',
            agentId,
            tabId,
            event,
          });
        }
      };
    },
    getCredential(typeId: string): Promise<Record<string, string> | null> {
      const id = `cred_${credReqId++}`;
      return new Promise((resolve, reject) => {
        pendingCredential.set(id, { agentId, resolve, reject });
        ipc.send({
          type: 'resolve-credential',
          id,
          agentId,
          typeId,
        });
      });
    },
    output(data: any): void {
      const str = typeof data === 'string' ? data : JSON.stringify(data);
      const outputs = pendingOutputs.get(agentId);
      if (outputs) outputs.push(str);
      ipc.send({ type: 'sandbox-output', agentId, output: str });
      timerResetCallbacks.get(agentId)?.();
    },
    createAttachment(
      originalFileName: string,
      data: Buffer | string,
    ): Promise<string> {
      if (
        !originalFileName ||
        typeof originalFileName !== 'string' ||
        (typeof data !== 'string' && !Buffer.isBuffer(data))
      ) {
        throw new Error(
          'createAttachment requires { originalFileName: string, data: Buffer | string (base64) }',
        );
      }
      const id = `att_${appReqId++}`;
      const rawData = Buffer.isBuffer(data)
        ? data
        : Buffer.from(data, 'base64');
      return new Promise<string>((resolve, reject) => {
        pendingCreateAttachment.set(id, {
          agentId,
          originalFileName: originalFileName,
          resolve,
          reject,
        });
        ipc.send({
          type: 'create-attachment',
          id,
          agentId,
          originalFileName: originalFileName,
          data: rawData.toString('base64'),
        });
        timerResetCallbacks.get(agentId)?.();
      });
    },
    openApp(
      appId: string,
      opts?: { pluginId?: string; height?: number },
    ): Promise<void> {
      const id = `app_${appReqId++}`;
      return new Promise((resolve, reject) => {
        pendingAppRequests.set(id, { resolve, reject });
        ipc.send({
          type: 'open-app',
          id,
          agentId,
          appId,
          pluginId: opts?.pluginId,
          height: opts?.height,
        });
      });
    },
    closeApp(): Promise<void> {
      const id = `app_${appReqId++}`;
      return new Promise((resolve, reject) => {
        pendingAppRequests.set(id, { resolve, reject });
        ipc.send({ type: 'close-app', id, agentId });
      });
    },
    sendMessage(
      appId: string,
      data: unknown,
      opts?: { pluginId?: string },
    ): Promise<void> {
      const id = `msg_${appReqId++}`;
      return new Promise((resolve, reject) => {
        pendingSendMessage.set(id, { resolve, reject });
        ipc.send({
          type: 'send-app-message',
          id,
          agentId,
          appId,
          pluginId: opts?.pluginId,
          data,
        });
      });
    },
    onMessage(
      appId: string,
      callback: (data: unknown) => void,
      opts?: { pluginId?: string },
    ): () => void {
      if (!agentMessageListeners.has(agentId))
        agentMessageListeners.set(agentId, new Map());

      const listeners = agentMessageListeners.get(agentId)!;
      const key = messageListenerKey(appId, opts?.pluginId);
      if (!listeners.has(key)) listeners.set(key, []);

      listeners.get(key)!.push(callback);
      return () => {
        const cbs = listeners.get(key);
        if (!cbs) return;
        const idx = cbs.indexOf(callback);
        if (idx >= 0) cbs.splice(idx, 1);
        if (cbs.length === 0) listeners.delete(key);
      };
    },
  };
}

const emptySecretMap = new Map<string, SecretMapEntry>();

/**
 * Node.js globals that are NOT provided by vm.createContext() by default.
 * V8 built-ins (JSON, Promise, Map, Set, Array, Object, Math, RegExp,
 * Date, Error, typed arrays, etc.) are already available automatically.
 */
function getContextGlobals(agentId: string) {
  const proxiedFetch = createCredentialFetch(
    fetch,
    () => agentSecretMaps.get(agentId) ?? emptySecretMap,
  );

  const globals: Record<string, unknown> = {
    // Timers
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
      setTimeout(fn, 0, ...args),
    clearImmediate: clearTimeout,
    // Networking
    fetch: proxiedFetch,
    Headers,
    Request,
    Response,
    AbortController,
    AbortSignal,
    // Console (useful for debugging, output goes to worker's stdout)
    console,
    // Web APIs exposed by Node.js
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Blob,
    FormData,
    // Binary data
    Buffer,
    // Utilities
    structuredClone,
    atob,
    btoa,
    queueMicrotask,
    crypto: {
      randomUUID: () => crypto.randomUUID(),
    },
    // Compatibility shims for CDN packages that expect browser/Node globals
    process: {
      env: { NODE_ENV: 'production' },
      browser: true,
      version: '',
      nextTick: (fn: (...args: unknown[]) => void, ...args: unknown[]) =>
        queueMicrotask(() => fn(...args)),
    },

    // --- Module system shims (no --experimental-vm-modules needed) ---

    require(specifier: string) {
      const name = specifier.replace(/^node:/, '');
      if (SANDBOXED_NODE_MODULES.has(name)) {
        const isolated = agentIsolatedFs.get(agentId);
        if (!isolated) {
          throw new Error(
            'No workspaces mounted. Mount a workspace before using fs.',
          );
        }
        return name === 'fs/promises' ? isolated.fsPromises : isolated.fs;
      }
      if (BLOCKED_NODE_MODULES.has(name)) {
        throw new Error(
          `"${specifier}" is not available in the sandbox for security reasons.`,
        );
      }
      const mod = preloadedModules.get(name);
      if (!mod) {
        const allowed = [
          ...ALLOWED_NODE_MODULES,
          ...SANDBOXED_NODE_MODULES,
        ].join(', ');
        throw new Error(
          `"${specifier}" is not a recognised allowed module. Allowed: ${allowed}`,
        );
      }
      return mod;
    },

    async importModule(url: string) {
      if (typeof url !== 'string' || !url.startsWith('https://')) {
        throw new Error(
          'importModule() only supports https:// URLs. ' +
            'For Node.js built-ins, use require() instead.',
        );
      }
      const resolved = ensureBundleParam(url);
      const cache = urlModuleCaches.get(agentId) ?? new Map();
      if (!urlModuleCaches.has(agentId)) urlModuleCaches.set(agentId, cache);
      return importFromUrl(resolved, cache);
    },
  };

  // self and global are circular references back to globalThis.
  // They must be set after context creation via vm.createContext(),
  // so we return them as part of the globals object and the context
  // itself becomes their value once assigned.
  globals.self = globals;
  globals.global = globals;

  return globals;
}

ipc.onMessage(async (msg) => {
  switch (msg.type) {
    case 'create-context': {
      await preloadAllowedModules();
      const ctx = vm.createContext({
        API: getSandboxAPI(msg.agentId),
        ...getContextGlobals(msg.agentId),
      });

      const agentId = msg.agentId;
      Object.defineProperty(ctx, 'fs', {
        get() {
          const isolated = agentIsolatedFs.get(agentId);
          if (!isolated) {
            throw new Error(
              'No workspaces mounted. Mount a workspace before using fs.',
            );
          }
          return isolated.fs;
        },
        enumerable: true,
        configurable: true,
      });
      Object.defineProperty(ctx, 'fsPromises', {
        get() {
          const isolated = agentIsolatedFs.get(agentId);
          if (!isolated) {
            throw new Error(
              'No workspaces mounted. Mount a workspace before using fs.',
            );
          }
          return isolated.fsPromises;
        },
        enumerable: true,
        configurable: true,
      });

      contexts.set(msg.agentId, ctx);
      urlModuleCaches.set(msg.agentId, new Map());
      break;
    }
    case 'destroy-context': {
      contexts.delete(msg.agentId);
      urlModuleCaches.delete(msg.agentId);
      agentMounts.delete(msg.agentId);
      agentIsolatedFs.delete(msg.agentId);
      agentSecretMaps.delete(msg.agentId);
      agentMessageListeners.delete(msg.agentId);
      agentCdpListeners.delete(msg.agentId);
      timerResetCallbacks.delete(msg.agentId);
      break;
    }
    case 'update-mounts': {
      agentMounts.set(msg.agentId, msg.mounts);
      refreshIsolatedFs(msg.agentId);
      break;
    }
    case 'execute': {
      const ctx = contexts.get(msg.agentId);
      if (!ctx) {
        ipc.send({ type: 'result', id: msg.id, error: 'No context' });
        return;
      }

      // Reset the per-agent collections for this execution
      pendingMultimodalAttachments.set(msg.agentId, []);
      pendingOutputs.set(msg.agentId, []);

      let softTimeoutId: NodeJS.Timeout | undefined;
      let hardTimeoutId: NodeJS.Timeout | undefined;
      let scriptPromise: Promise<unknown> | undefined;

      const SOFT_TIMEOUT_MS = 45_000;
      const HARD_TIMEOUT_MS = 180_000;

      try {
        const wrapped = `(async () => { ${msg.code} })()`;
        const script = new vm.Script(wrapped);
        // Sync timeout (30s) catches infinite synchronous loops (e.g. while(true){}).
        scriptPromise = script.runInContext(ctx, { timeout: 30_000 });

        // Soft async timeout: resets on every API.output() / API.createAttachment() call.
        let softReject: ((reason: Error) => void) | undefined;
        const softTimeoutPromise = new Promise<never>((_, reject) => {
          softReject = reject;
          softTimeoutId = setTimeout(() => {
            reject(
              new Error(
                `Script execution timed out after ${SOFT_TIMEOUT_MS / 1_000}s of inactivity (no API.output() calls)`,
              ),
            );
          }, SOFT_TIMEOUT_MS);
        });

        timerResetCallbacks.set(msg.agentId, () => {
          if (softTimeoutId !== undefined) clearTimeout(softTimeoutId);
          softTimeoutId = setTimeout(() => {
            softReject?.(
              new Error(
                `Script execution timed out after ${SOFT_TIMEOUT_MS / 1_000}s of inactivity (no API.output() calls)`,
              ),
            );
          }, SOFT_TIMEOUT_MS);
        });

        // Hard async timeout: absolute wall-clock cap, cannot be reset.
        const hardTimeoutPromise = new Promise<never>((_, reject) => {
          hardTimeoutId = setTimeout(() => {
            reject(
              new Error(
                `Script execution exceeded maximum wall-clock time of ${HARD_TIMEOUT_MS / 1_000}s`,
              ),
            );
          }, HARD_TIMEOUT_MS);
        });

        const value = await Promise.race([
          scriptPromise,
          softTimeoutPromise,
          hardTimeoutPromise,
        ]);
        clearTimeout(softTimeoutId);
        clearTimeout(hardTimeoutId);
        timerResetCallbacks.delete(msg.agentId);

        // Attachments are drained server-side via drainPendingAttachments
        // after the step completes — no need to send them in the IPC result.
        pendingMultimodalAttachments.delete(msg.agentId);
        const outputs = pendingOutputs.get(msg.agentId) ?? [];
        pendingOutputs.delete(msg.agentId);

        ipc.send({
          type: 'result',
          id: msg.id,
          value,
          outputs: outputs.length > 0 ? outputs : undefined,
        });
      } catch (err) {
        if (softTimeoutId !== undefined) clearTimeout(softTimeoutId);
        if (hardTimeoutId !== undefined) clearTimeout(hardTimeoutId);
        timerResetCallbacks.delete(msg.agentId);
        if (scriptPromise) scriptPromise.catch(() => {});
        pendingMultimodalAttachments.delete(msg.agentId);
        pendingOutputs.delete(msg.agentId);
        ipc.send({
          type: 'result',
          id: msg.id,
          error: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
        });
      }
      break;
    }
    case 'cdp-result': {
      const p = pendingCdp.get(msg.id);
      if (!p) return;
      pendingCdp.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
      break;
    }
    case 'cdp-event': {
      const listeners = agentCdpListeners.get(msg.agentId);
      if (!listeners) break;
      const key = `${msg.tabId}\0${msg.event}`;
      const cbs = listeners.get(key);
      if (!cbs) return;
      for (const cb of cbs) {
        try {
          cb(msg.params);
        } catch {
          // Prevent one failing callback from breaking others
        }
      }
      break;
    }
    case 'credential-result': {
      const p = pendingCredential.get(msg.id);
      if (!p) return;
      pendingCredential.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else {
        if (msg.data && msg.secretEntries) {
          if (!agentSecretMaps.has(p.agentId))
            agentSecretMaps.set(p.agentId, new Map());

          const secrets = agentSecretMaps.get(p.agentId)!;
          for (const [placeholder, real, allowedOrigins] of msg.secretEntries)
            secrets.set(placeholder, { value: real, allowedOrigins });
        }
        p.resolve(msg.data);
      }
      break;
    }
    case 'create-attachment-result': {
      const p = pendingCreateAttachment.get(msg.id);
      if (!p) return;
      pendingCreateAttachment.delete(msg.id);
      if (msg.error) {
        p.reject(new Error(msg.error));
      } else if (msg.fileName) {
        // Register in the per-agent pending collection so the result message includes it
        const collection = pendingMultimodalAttachments.get(p.agentId);
        if (collection) {
          collection.push({
            path: `att/${msg.fileName}`,
            originalFileName: p.originalFileName,
          });
        }
        p.resolve(msg.fileName);
      } else {
        p.reject(new Error('createAttachment: no fileName returned'));
      }
      break;
    }
    case 'open-app-result':
    case 'close-app-result': {
      const p = pendingAppRequests.get(msg.id);
      if (!p) return;
      pendingAppRequests.delete(msg.id);
      if (msg.success) p.resolve();
      else p.reject(new Error(msg.error ?? 'App operation failed'));

      break;
    }
    case 'send-app-message-result': {
      const p = pendingSendMessage.get(msg.id);
      if (!p) return;
      pendingSendMessage.delete(msg.id);
      if (msg.success) p.resolve();
      else p.reject(new Error(msg.error ?? 'Failed to send message to app'));

      break;
    }
    case 'app-message-received': {
      const listeners = agentMessageListeners.get(msg.agentId);
      if (!listeners) break;
      const key = messageListenerKey(msg.appId, msg.pluginId);
      const cbs = listeners.get(key);
      if (!cbs) return;
      for (const cb of cbs) {
        try {
          cb(msg.data);
        } catch {
          // listener errors are silently swallowed
        }
      }
      break;
    }
  }
});
