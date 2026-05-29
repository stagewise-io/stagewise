import path from 'node:path';
import type { HostPaths } from '@stagewise/agent-core/host';

/**
 * Session-scoped paths under `os.tmpdir()/stagewise-cli/<sessionId>/`.
 */
export function createCliHostPaths(sessionRoot: string): HostPaths {
  const data = path.join(sessionRoot, 'data');
  const stagewise = path.join(data, 'stagewise');

  return {
    dataDir: () => stagewise,
    tempDir: () => path.join(sessionRoot, 'tmp'),

    agentsDir: () => path.join(stagewise, 'agents'),
    agentDir: (agentId: string) => path.join(stagewise, 'agents', agentId),
    agentAttachmentsDir: (agentId: string) =>
      path.join(stagewise, 'agents', agentId, 'attachments'),
    agentAttachmentPath: (agentId: string, attachmentId: string) =>
      path.join(stagewise, 'agents', agentId, 'attachments', attachmentId),
    agentAppsDir: (agentId: string) =>
      path.join(stagewise, 'agents', agentId, 'apps'),
    agentShellLogsDir: (agentId: string) =>
      path.join(stagewise, 'agents', agentId, 'shell-logs'),

    diffHistoryDir: () => path.join(stagewise, 'diff-history'),
    diffHistoryDbPath: () =>
      path.join(stagewise, 'diff-history', 'data.sqlite'),
    diffHistoryBlobsDir: () => path.join(stagewise, 'diff-history', 'blobs'),
    agentDbPath: () => path.join(stagewise, 'agents', 'instances.sqlite'),
    fileReadCacheDbPath: () => path.join(stagewise, 'file-read-cache.sqlite'),
    processedImageCacheDbPath: () =>
      path.join(stagewise, 'processed-image-cache.sqlite'),

    userDataDir: () => path.join(stagewise, 'user'),
    plansDir: () => path.join(stagewise, 'user', 'plans'),
    logsDir: () => path.join(stagewise, 'user', 'logs'),

    pluginsDir: () => path.join(sessionRoot, 'bundled', 'plugins'),
    builtinSkillsDir: () => path.join(sessionRoot, 'bundled', 'builtin-skills'),
    ripgrepBaseDir: () => path.join(sessionRoot, 'bundled', 'ripgrep'),
  };
}
