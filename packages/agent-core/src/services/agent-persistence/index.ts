/**
 * Agent persistence service — stores agent metadata and message history
 * in a SQLite database keyed on `host.paths.agentDbPath()`.
 *
 * Construction is host-agnostic: callers pass a `HostPaths` + `Logger`.
 * The package never reads Electron-specific paths directly.
 */
export {
  AgentPersistenceDB,
  collectWorkspaceLastUsedAtByPath,
  type AgentPersistenceDBDeps,
} from './db';
export type {
  StoredAgentInstance,
  NewStoredAgentInstance,
} from './schema';
