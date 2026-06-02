/**
 * Internal filesystem seam for `@stagewise/agent-core`.
 *
 * Per SPEC D24 (packages/agent-core/SPEC.md) and humanspec.md, all
 * `node:fs` / `node:fs/promises` usage inside this package must flow
 * through this single module. The seam lets Sprint 5 swap filesystem
 * internals (remote host, wire protocol) in one place rather than
 * across every service and tool call site.
 *
 * Surface policy: wrap what the package actually uses. Add an export
 * here **before** introducing a call site that needs it — no
 * speculative surface. Tests are exempt from this rule; they
 * construct fixtures directly and are not the consumers Sprint 5
 * needs to swap.
 *
 * Also includes the chokidar-based `watch` wrapper so every form of
 * filesystem observation (in-tool reads/writes and out-of-band change
 * detection) flows through the same seam. The wrapper is a trivial
 * delegation today; its existence is what matters.
 *
 * Do NOT import `node:fs` or `node:fs/promises` from other files in
 * `packages/agent-core/src/`. A Biome `noRestrictedImports` rule
 * enforces this for non-test source files.
 */

export {
  readFile,
  writeFile,
  stat,
  readdir,
  mkdir,
  rename,
  unlink,
  copyFile,
  access,
  rm,
  open,
  realpath,
} from 'node:fs/promises';
export { createReadStream, createWriteStream } from 'node:fs';
export type { ReadStream, WriteStream } from 'node:fs';

import chokidar, { type FSWatcher, type ChokidarOptions } from 'chokidar';

/**
 * Filesystem watcher. Delegates to `chokidar.watch` today. The only
 * reason this wrapper exists is to give Sprint 5 a single intercept
 * point for filesystem observation alongside the read/write seam.
 * Signature mirrors `chokidar.watch` exactly.
 */
export function watch(
  paths: string | readonly string[],
  options?: ChokidarOptions,
): FSWatcher {
  return chokidar.watch(paths as string | string[], options);
}

export type { FSWatcher, ChokidarOptions };
