import type { HostPaths } from '@stagewise/agent-core';
import {
  getAgentAppsDir,
  getAgentAttachmentPath,
  getAgentAttachmentsDir,
  getAgentDbPath,
  getAgentDir,
  getDbPath,
  getAgentShellLogsDir,
  getAgentsDir,
  getBuiltinSkillsPath,
  getDataRoot,
  getDiffHistoryBlobsDir,
  getDiffHistoryDbPath,
  getDiffHistoryDir,
  getLogsDir,
  getPlansDir,
  getPluginsPath,
  getRipgrepBasePath,
  getTempRoot,
  getUserDataDir,
} from '@/utils/paths';

/**
 * Thin `HostPaths` adapter over the Electron-backed path resolvers in
 * `apps/browser/src/backend/utils/paths.ts`. Every method is a 1:1
 * delegate — no logic, no caching, no mutation. The browser app is the
 * only trusted source of Electron-derived paths; `@stagewise/agent-core`
 * never reaches for them directly.
 *
 * Safe to call at any point after `app` has resolved `userData` (i.e.
 * anywhere inside `main()`). No-arg construction keeps callers light.
 */
let _singleton: HostPaths | null = null;

/**
 * Lazy-singleton accessor for the browser-side `HostPaths`. Safe to call
 * anywhere after Electron's `app` has resolved `userData` — the first
 * call assembles the adapter, subsequent calls return the cached
 * instance. Intended for call sites that need `HostPaths` but are too
 * peripheral to take it via constructor injection (e.g. ad-hoc path
 * helpers, event handlers, static utilities).
 */
export function getBrowserHostPaths(): HostPaths {
  if (!_singleton) _singleton = createBrowserHostPaths();
  return _singleton;
}

export function createBrowserHostPaths(): HostPaths {
  return {
    dataDir: () => getDataRoot(),
    tempDir: () => getTempRoot(),

    agentsDir: () => getAgentsDir(),
    agentDir: (agentId) => getAgentDir(agentId),
    agentAttachmentsDir: (agentId) => getAgentAttachmentsDir(agentId),
    agentAttachmentPath: (agentId, attachmentId) =>
      getAgentAttachmentPath(agentId, attachmentId),
    agentAppsDir: (agentId) => getAgentAppsDir(agentId),
    agentShellLogsDir: (agentId) => getAgentShellLogsDir(agentId),

    diffHistoryDir: () => getDiffHistoryDir(),
    diffHistoryDbPath: () => getDiffHistoryDbPath(),
    diffHistoryBlobsDir: () => getDiffHistoryBlobsDir(),
    agentDbPath: () => getAgentDbPath(),
    fileReadCacheDbPath: () => getDbPath('file-read-cache'),
    processedImageCacheDbPath: () => getDbPath('processed-image-cache'),

    userDataDir: () => getUserDataDir(),
    plansDir: () => getPlansDir(),
    logsDir: () => getLogsDir(),

    pluginsDir: () => getPluginsPath(),
    builtinSkillsDir: () => getBuiltinSkillsPath(),
    ripgrepBaseDir: () => getRipgrepBasePath(),
  };
}
