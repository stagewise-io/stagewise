import fs from 'node:fs';
import path from 'node:path';
import type { MountDescriptor, MountPermission } from '../ipc';

const MAX_DIFF_TEXT_FILE_SIZE = 2 * 1024 * 1024; // 2MB — matches shared-types

type DiffNotifier = (
  absolutePath: string,
  before: string | null,
  after: string | null,
  isExternal: boolean,
  bytesWritten: number,
) => void;

interface ResolvedPath {
  absolutePath: string;
  mount: MountDescriptor;
}

/**
 * Resolve a sandbox-relative path (e.g. "w1/src/index.ts") to an absolute
 * filesystem path, validating that it stays within the mount root.
 *
 * If only one mount is active, the prefix is optional for convenience.
 */
function resolveSandboxPath(
  sandboxPath: string | Buffer | URL,
  mounts: MountDescriptor[],
): ResolvedPath {
  const raw =
    typeof sandboxPath === 'string'
      ? sandboxPath
      : Buffer.isBuffer(sandboxPath)
        ? sandboxPath.toString()
        : sandboxPath instanceof URL && sandboxPath.protocol === 'file:'
          ? sandboxPath.pathname
          : String(sandboxPath);

  if (mounts.length === 0) {
    throw new Error('No workspaces mounted. Mount a workspace first.');
  }

  const normalized = raw.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const prefixCandidate = parts[0];
  const matchedMount = mounts.find((m) => m.prefix === prefixCandidate);

  let mount: MountDescriptor;
  let relativePart: string;

  if (matchedMount) {
    mount = matchedMount;
    relativePart = parts.slice(1).join('/');
  } else if (mounts.length === 1) {
    mount = mounts[0];
    relativePart = normalized;
  } else {
    throw new Error(
      `Path must be prefixed with a mount (${mounts.map((m) => m.prefix).join(', ')}). Got: "${raw}"`,
    );
  }

  const safePart = path.posix.resolve('/', relativePart);
  const absolute = path.join(mount.absolutePath, safePart);

  if (!absolute.startsWith(mount.absolutePath)) {
    throw new Error('Path escapes the mounted workspace.');
  }

  try {
    const real = fs.realpathSync(absolute);
    if (!real.startsWith(mount.absolutePath)) {
      throw new Error(
        'Resolved path (via symlink) escapes the mounted workspace.',
      );
    }
    return { absolutePath: real, mount };
  } catch (err: any) {
    if (err.code === 'ENOENT') return { absolutePath: absolute, mount };
    if (err.message?.includes('escapes')) throw err;
    return { absolutePath: absolute, mount };
  }
}

// ---------------------------------------------------------------------------
// Permission enforcement
// ---------------------------------------------------------------------------

const READ_METHODS = new Set([
  'readFile',
  'readFileSync',
  'stat',
  'statSync',
  'statfs',
  'statfsSync',
  'lstat',
  'lstatSync',
  'access',
  'accessSync',
  'exists',
  'existsSync',
  'readlink',
  'readlinkSync',
  'realpath',
  'realpathSync',
  'open',
  'openSync',
  'createReadStream',
  'watch',
  'watchFile',
  'unwatchFile',
]);

const LIST_METHODS = new Set([
  'readdir',
  'readdirSync',
  'opendir',
  'opendirSync',
]);

const DELETE_METHODS = new Set([
  'unlink',
  'unlinkSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
]);

const EDIT_ONLY_METHODS = new Set([
  'truncate',
  'truncateSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'lchmod',
  'lchmodSync',
  'lchown',
  'lchownSync',
  'utimes',
  'utimesSync',
  'lutimes',
  'lutimesSync',
]);

const CREATE_ONLY_METHODS = new Set([
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
]);

/**
 * For writeFile/appendFile/createWriteStream the required permission
 * depends on whether the target already exists (edit) or not (create).
 */
const WRITE_OR_CREATE_METHODS = new Set([
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'createWriteStream',
]);

function fileExistsSync(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Classify which permission a single-path method requires.
 * For write-or-create methods, checks file existence to distinguish.
 */
function classifyPermission(
  methodName: string,
  absolutePath: string,
): MountPermission | null {
  if (READ_METHODS.has(methodName)) return 'read';
  if (LIST_METHODS.has(methodName)) return 'list';
  if (DELETE_METHODS.has(methodName)) return 'delete';
  if (EDIT_ONLY_METHODS.has(methodName)) return 'edit';
  if (CREATE_ONLY_METHODS.has(methodName)) return 'create';
  if (WRITE_OR_CREATE_METHODS.has(methodName)) {
    return fileExistsSync(absolutePath) ? 'edit' : 'create';
  }
  return null;
}

const PERMISSION_SUGGESTIONS: Record<
  MountPermission,
  Record<string, string>
> = {
  read: {},
  list: {},
  create: {
    att: 'Use API.createAttachment() to produce output attachments — direct writes to att/ are not permitted.',
  },
  edit: {
    att: 'Use API.createAttachment() to produce output attachments — direct writes to att/ are not permitted.',
  },
  delete: {
    att: 'Attachments cannot be deleted.',
  },
};

function enforcePermission(
  mount: MountDescriptor,
  required: MountPermission,
  methodName: string,
): void {
  if (mount.permissions.includes(required)) return;
  const suggestion =
    PERMISSION_SUGGESTIONS[required]?.[mount.prefix] ??
    (mount.permissions.length <= 2 ? 'This mount is read-only.' : '');
  const msg = `Permission denied: '${methodName}' requires '${required}' access on mount '${mount.prefix}/' (current permissions: [${mount.permissions.join(', ')}]).${suggestion ? ` ${suggestion}` : ''}`;
  throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFileBinarySync(buf: Buffer): boolean {
  if (buf.length === 0) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}

function captureState(absolutePath: string): {
  content: string | null;
  isExternal: boolean;
} {
  try {
    const stats = fs.statSync(absolutePath);
    if (stats.size > MAX_DIFF_TEXT_FILE_SIZE) {
      return { content: null, isExternal: true };
    }
    const buf = fs.readFileSync(absolutePath);
    if (isFileBinarySync(buf)) {
      return { content: null, isExternal: true };
    }
    return { content: buf.toString('utf-8'), isExternal: false };
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { content: null, isExternal: false };
    }
    return { content: null, isExternal: true };
  }
}

// ---------------------------------------------------------------------------
// Function classification — determines which wrapper to apply and which
// argument positions contain paths. Based on sandboxed-fs, extended with
// modern Node.js methods.
// ---------------------------------------------------------------------------

const PATH_FUNCTIONS = [
  'access',
  'chmod',
  'chown',
  'lchmod',
  'lchown',
  'lstat',
  'mkdir',
  'open',
  'opendir',
  'readdir',
  'readlink',
  'rmdir',
  'rm',
  'stat',
  'statfs',
  'truncate',
  'unlink',
  'utimes',
  'lutimes',
  'exists',
] as const;

const FILE_FUNCTIONS = ['appendFile', 'readFile', 'writeFile'] as const;

const TWO_PATH_FUNCTIONS = [
  'copyFile',
  'cp',
  'link',
  'rename',
  'symlink',
] as const;

const PATH_NON_SYNC_FUNCTIONS = [
  'createReadStream',
  'createWriteStream',
  'watch',
  'watchFile',
  'unwatchFile',
] as const;

const STRING_PATH_FUNCTIONS = ['mkdtemp'] as const;

const REALPATH_FUNCTIONS = ['realpath'] as const;

/** Methods that mutate the filesystem and need diff tracking. */
const MUTATION_METHODS = new Set([
  'writeFile',
  'writeFileSync',
  'appendFile',
  'appendFileSync',
  'copyFile',
  'copyFileSync',
  'cp',
  'cpSync',
  'rename',
  'renameSync',
  'unlink',
  'unlinkSync',
  'rm',
  'rmSync',
  'rmdir',
  'rmdirSync',
  'mkdir',
  'mkdirSync',
  'link',
  'linkSync',
  'symlink',
  'symlinkSync',
  'truncate',
  'truncateSync',
  'chmod',
  'chmodSync',
  'chown',
  'chownSync',
  'lchmod',
  'lchmodSync',
  'lchown',
  'lchownSync',
  'utimes',
  'utimesSync',
  'lutimes',
  'lutimesSync',
]);

/**
 * For two-path methods, classify the required permissions for source
 * and destination separately.
 */
function classifyTwoPathPermissions(
  methodName: string,
  dstAbsolutePath: string,
): {
  src: MountPermission;
  dst: MountPermission;
  srcExtra?: MountPermission;
} {
  const baseName = methodName.replace(/Sync$/, '');
  const dstPerm: MountPermission = fileExistsSync(dstAbsolutePath)
    ? 'edit'
    : 'create';
  switch (baseName) {
    case 'rename':
      return { src: 'read', dst: dstPerm, srcExtra: 'delete' };
    case 'link':
    case 'symlink':
      return { src: 'read', dst: 'create' };
    default:
      return { src: 'read', dst: dstPerm };
  }
}

// ---------------------------------------------------------------------------
// Generic wrappers — one per argument signature pattern
// ---------------------------------------------------------------------------

type AnyFn = (...args: any[]) => any;

function wrapPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return (p: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(p, mounts);
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const before = captureState(absolutePath);
      const result = fn(absolutePath, ...args);
      const after = captureState(absolutePath);
      const bytesWritten = after.content?.length ?? 0;
      notifyDiff(
        absolutePath,
        before.content,
        after.content,
        before.isExternal || after.isExternal,
        bytesWritten,
      );
      return result;
    }
    return fn(absolutePath, ...args);
  };
}

function wrapFileFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return (file: any, ...args: any[]) => {
    if (typeof file === 'number') return fn(file, ...args);
    const { absolutePath, mount } = resolveSandboxPath(file, mounts);
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const before = captureState(absolutePath);
      const result = fn(absolutePath, ...args);
      const after = captureState(absolutePath);
      const bytesWritten = after.content?.length ?? 0;
      notifyDiff(
        absolutePath,
        before.content,
        after.content,
        before.isExternal || after.isExternal,
        bytesWritten,
      );
      return result;
    }
    return fn(absolutePath, ...args);
  };
}

function wrapTwoPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return (p1: any, p2: any, ...args: any[]) => {
    const src = resolveSandboxPath(p1, mounts);
    const dst = resolveSandboxPath(p2, mounts);
    const perms = classifyTwoPathPermissions(methodName, dst.absolutePath);
    enforcePermission(src.mount, perms.src, methodName);
    enforcePermission(dst.mount, perms.dst, methodName);
    if (perms.srcExtra) {
      enforcePermission(src.mount, perms.srcExtra, methodName);
    }
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const beforeSrc = captureState(src.absolutePath);
      const beforeDst = captureState(dst.absolutePath);
      const result = fn(src.absolutePath, dst.absolutePath, ...args);
      const afterSrc = captureState(src.absolutePath);
      const afterDst = captureState(dst.absolutePath);
      if (beforeSrc.content !== afterSrc.content) {
        notifyDiff(
          src.absolutePath,
          beforeSrc.content,
          afterSrc.content,
          beforeSrc.isExternal || afterSrc.isExternal,
          0,
        );
      }
      notifyDiff(
        dst.absolutePath,
        beforeDst.content,
        afterDst.content,
        beforeDst.isExternal || afterDst.isExternal,
        afterDst.content?.length ?? 0,
      );
      return result;
    }
    return fn(src.absolutePath, dst.absolutePath, ...args);
  };
}

function wrapStringPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  methodName: string,
): AnyFn {
  return (prefix: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(
      typeof prefix === 'string' ? prefix : String(prefix),
      mounts,
    );
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    return fn(absolutePath, ...args);
  };
}

function wrapRealpathFn(fn: AnyFn, mounts: MountDescriptor[]): AnyFn {
  const wrapped: any = (p: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(p, mounts);
    enforcePermission(mount, 'read', 'realpath');
    return fn(absolutePath, ...args);
  };
  if ((fn as any).native) {
    wrapped.native = (p: any, ...args: any[]) => {
      const { absolutePath, mount } = resolveSandboxPath(p, mounts);
      enforcePermission(mount, 'read', 'realpath');
      return (fn as any).native(absolutePath, ...args);
    };
  }
  return wrapped;
}

// ---------------------------------------------------------------------------
// Async (promises) wrappers — same logic but for async functions, with
// async diff capture after awaiting the real call.
// ---------------------------------------------------------------------------

function wrapAsyncPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return async (p: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(p, mounts);
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const before = captureState(absolutePath);
      const result = await fn(absolutePath, ...args);
      const after = captureState(absolutePath);
      notifyDiff(
        absolutePath,
        before.content,
        after.content,
        before.isExternal || after.isExternal,
        after.content?.length ?? 0,
      );
      return result;
    }
    return fn(absolutePath, ...args);
  };
}

function wrapAsyncFileFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return async (file: any, ...args: any[]) => {
    if (typeof file === 'number') return fn(file, ...args);
    const { absolutePath, mount } = resolveSandboxPath(file, mounts);
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const before = captureState(absolutePath);
      const result = await fn(absolutePath, ...args);
      const after = captureState(absolutePath);
      notifyDiff(
        absolutePath,
        before.content,
        after.content,
        before.isExternal || after.isExternal,
        after.content?.length ?? 0,
      );
      return result;
    }
    return fn(absolutePath, ...args);
  };
}

function wrapAsyncTwoPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
  methodName: string,
): AnyFn {
  return async (p1: any, p2: any, ...args: any[]) => {
    const src = resolveSandboxPath(p1, mounts);
    const dst = resolveSandboxPath(p2, mounts);
    const perms = classifyTwoPathPermissions(methodName, dst.absolutePath);
    enforcePermission(src.mount, perms.src, methodName);
    enforcePermission(dst.mount, perms.dst, methodName);
    if (perms.srcExtra) {
      enforcePermission(src.mount, perms.srcExtra, methodName);
    }
    if (notifyDiff && MUTATION_METHODS.has(methodName)) {
      const beforeSrc = captureState(src.absolutePath);
      const beforeDst = captureState(dst.absolutePath);
      const result = await fn(src.absolutePath, dst.absolutePath, ...args);
      const afterSrc = captureState(src.absolutePath);
      const afterDst = captureState(dst.absolutePath);
      if (beforeSrc.content !== afterSrc.content) {
        notifyDiff(
          src.absolutePath,
          beforeSrc.content,
          afterSrc.content,
          beforeSrc.isExternal || afterSrc.isExternal,
          0,
        );
      }
      notifyDiff(
        dst.absolutePath,
        beforeDst.content,
        afterDst.content,
        beforeDst.isExternal || afterDst.isExternal,
        afterDst.content?.length ?? 0,
      );
      return result;
    }
    return fn(src.absolutePath, dst.absolutePath, ...args);
  };
}

function wrapAsyncStringPathFn(
  fn: AnyFn,
  mounts: MountDescriptor[],
  methodName: string,
): AnyFn {
  return (prefix: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(
      typeof prefix === 'string' ? prefix : String(prefix),
      mounts,
    );
    const perm = classifyPermission(methodName, absolutePath);
    if (perm) enforcePermission(mount, perm, methodName);
    return fn(absolutePath, ...args);
  };
}

function wrapAsyncRealpathFn(fn: AnyFn, mounts: MountDescriptor[]): AnyFn {
  return (p: any, ...args: any[]) => {
    const { absolutePath, mount } = resolveSandboxPath(p, mounts);
    enforcePermission(mount, 'read', 'realpath');
    return fn(absolutePath, ...args);
  };
}

// ---------------------------------------------------------------------------
// Main factory
// ---------------------------------------------------------------------------

/**
 * Create a restricted `fs` module scoped to the given mounts.
 * Each mount's `permissions` array controls which operations are allowed.
 *
 * @param mounts - Currently active mount descriptors for this agent
 * @param notifyDiff - Fire-and-forget callback to report file mutations
 *                     to the main process for diff-history tracking
 * @returns Objects mirroring `node:fs` and `node:fs/promises`
 */
export function createIsolatedFs(
  mounts: MountDescriptor[],
  notifyDiff: DiffNotifier | null,
): {
  isolatedFs: Record<string, any>;
  isolatedFsPromises: Record<string, any>;
} {
  const wrapped: Record<string, any> = Object.assign({}, fs);
  const wrappedPromises: Record<string, any> = Object.assign({}, fs.promises);

  // -- pathFunctions (single path as first arg) --
  for (const name of PATH_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapPathFn(fn, mounts, notifyDiff, name);
    }
    const syncName = `${name}Sync`;
    const syncFn = (fs as any)[syncName];
    if (syncFn) {
      wrapped[syncName] = wrapPathFn(syncFn, mounts, notifyDiff, syncName);
    }
    const promiseFn = (fs.promises as any)[name];
    if (promiseFn) {
      wrappedPromises[name] = wrapAsyncPathFn(
        promiseFn,
        mounts,
        notifyDiff,
        name,
      );
    }
  }

  // -- fileFunctions (path-or-fd first arg) --
  for (const name of FILE_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapFileFn(fn, mounts, notifyDiff, name);
    }
    const syncName = `${name}Sync`;
    const syncFn = (fs as any)[syncName];
    if (syncFn) {
      wrapped[syncName] = wrapFileFn(syncFn, mounts, notifyDiff, syncName);
    }
    const promiseFn = (fs.promises as any)[name];
    if (promiseFn) {
      wrappedPromises[name] = wrapAsyncFileFn(
        promiseFn,
        mounts,
        notifyDiff,
        name,
      );
    }
  }

  // -- twoPathFunctions (two path args) --
  for (const name of TWO_PATH_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapTwoPathFn(fn, mounts, notifyDiff, name);
    }
    const syncName = `${name}Sync`;
    const syncFn = (fs as any)[syncName];
    if (syncFn) {
      wrapped[syncName] = wrapTwoPathFn(syncFn, mounts, notifyDiff, syncName);
    }
    const promiseFn = (fs.promises as any)[name];
    if (promiseFn) {
      wrappedPromises[name] = wrapAsyncTwoPathFn(
        promiseFn,
        mounts,
        notifyDiff,
        name,
      );
    }
  }

  // -- pathNonSyncFunctions (no sync variant, no promises variant) --
  for (const name of PATH_NON_SYNC_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapPathFn(fn, mounts, null, name);
    }
  }

  // -- stringPathFunctions --
  for (const name of STRING_PATH_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapStringPathFn(fn, mounts, name);
    }
    const syncName = `${name}Sync`;
    const syncFn = (fs as any)[syncName];
    if (syncFn) {
      wrapped[syncName] = wrapStringPathFn(syncFn, mounts, syncName);
    }
    const promiseFn = (fs.promises as any)[name];
    if (promiseFn) {
      wrappedPromises[name] = wrapAsyncStringPathFn(promiseFn, mounts, name);
    }
  }

  // -- realpath (has .native) --
  for (const name of REALPATH_FUNCTIONS) {
    const fn = (fs as any)[name];
    if (fn) {
      wrapped[name] = wrapRealpathFn(fn, mounts);
    }
    const syncName = `${name}Sync`;
    const syncFn = (fs as any)[syncName];
    if (syncFn) {
      wrapped[syncName] = wrapRealpathFn(syncFn, mounts);
    }
    const promiseFn = (fs.promises as any)[name];
    if (promiseFn) {
      wrappedPromises[name] = wrapAsyncRealpathFn(promiseFn, mounts);
    }
  }

  // Ensure the promises sub-object is accessible on the main fs wrapper
  wrapped.promises = wrappedPromises;

  // Forward constants
  wrapped.constants = fs.constants;

  return { isolatedFs: wrapped, isolatedFsPromises: wrappedPromises };
}
