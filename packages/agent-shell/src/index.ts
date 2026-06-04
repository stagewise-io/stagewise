/**
 * `@stagewise/agent-shell` — Node-side PTY shell runtime and tools.
 *
 * Main entry (pulls `node-pty`). For the pure schema surface import
 * `@stagewise/agent-shell/schemas`; for the env-state domain adapter
 * import `@stagewise/agent-shell/env`.
 */
export * from './engine';
export * from './tools';
export type {
  ShellSnapshot,
  ShellSessionSnapshot,
} from './schemas';
