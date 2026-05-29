/**
 * Absolute-path resolver supplied by the host.
 *
 * agent-core must never read OS-conventional locations (`app.getPath`,
 * `process.env.HOME`, `os.tmpdir`) directly. Every filesystem address
 * it needs is requested through `HostPaths`. This is the one-way valve
 * that keeps the package portable across Electron, CLI, and future
 * remote hosts.
 *
 * All methods return **absolute** paths. All methods are synchronous —
 * the browser host implements them as pure delegates over
 * `apps/browser/src/backend/utils/paths.ts`, which is itself synchronous.
 */
export interface HostPaths {
  /** User-scoped data root. Browser: `app.getPath('userData')/stagewise`. */
  dataDir(): string;
  /** OS temp scratch directory for the host. */
  tempDir(): string;

  /** Parent directory for all agent-instance subtrees. */
  agentsDir(): string;
  /** Per-agent-instance root directory. */
  agentDir(agentId: string): string;
  /** Per-agent attachments blob directory. */
  agentAttachmentsDir(agentId: string): string;
  /** Absolute path to a specific attachment blob. */
  agentAttachmentPath(agentId: string, attachmentId: string): string;
  /** Per-agent mini-apps directory. */
  agentAppsDir(agentId: string): string;
  /** Per-agent shell-log directory. */
  agentShellLogsDir(agentId: string): string;

  /** Diff-history service root. */
  diffHistoryDir(): string;
  /** Diff-history SQLite database file. */
  diffHistoryDbPath(): string;
  /** Diff-history content-addressed blobs directory. */
  diffHistoryBlobsDir(): string;
  /** Agent-manager persistence SQLite database file. */
  agentDbPath(): string;
  /** File-read cache SQLite database file. */
  fileReadCacheDbPath(): string;
  /** Processed-image cache SQLite database file. */
  processedImageCacheDbPath(): string;

  /** User-visible data root (plans, logs). */
  userDataDir(): string;
  /** Shared user plans directory. */
  plansDir(): string;
  /** Shared user log-channel directory. */
  logsDir(): string;

  /** Root of the bundled plugins tree shipped with the host. */
  pluginsDir(): string;
  /** Root of the bundled built-in skills tree shipped with the host. */
  builtinSkillsDir(): string;
  /** Base directory where the host installs the ripgrep binary. */
  ripgrepBaseDir(): string;
}
