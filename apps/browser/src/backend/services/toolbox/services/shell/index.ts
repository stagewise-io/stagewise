import { DisposableService } from '../../../disposable';
import type { Logger } from '../../../logger';
import type { KartonService } from '@/services/karton';
import { detectShell } from './detect-shell';
import { resolveShellEnv } from './resolve-shell-env';
import { sanitizeEnv } from './sanitize-env';
import { SessionManager } from './session-manager';
import { getAgentShellLogsDir } from '@/utils/paths';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ShellSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type {
  DetectedShell,
  SessionCommandRequest,
  SessionCommandResult,
} from './types';

export class ShellService extends DisposableService {
  private readonly logger: Logger;
  private readonly kartonService?: KartonService;

  private shell: DetectedShell | null = null;
  private sessionManager: SessionManager | null = null;
  private resolvedEnv: Record<string, string> | null = null;

  private readonly preDetectedShell: DetectedShell | null;
  private readonly preResolvedEnv: Record<string, string> | null;

  /**
   * Per-tool-call streaming bookkeeping. Each entry records which session
   * the tool call is streaming from and whether new output has arrived
   * since the last flush. The UI snapshot is computed on-demand by
   * reading the session's current grid state — we do not accumulate raw
   * chunks here.
   */
  private readonly outputBuffers = new Map<
    string,
    { sessionId: string; dirty: boolean }
  >();
  private readonly outputFlushTimers = new Map<string, NodeJS.Timeout>();
  private readonly outputMaxIntervalTimers = new Map<string, NodeJS.Timeout>();

  /** Per-agent throttle timers for pushing the shells manifest to Karton. */
  private readonly shellManifestTimers = new Map<string, NodeJS.Timeout>();

  private static readonly FLUSH_DEBOUNCE_MS = 100;
  private static readonly FLUSH_MAX_INTERVAL_MS = 300;
  /**
   * Per-flush cap for the live UI snapshot. Grid serialization is already
   * bounded by `STREAMING_MAX_ROWS` (~24KB theoretical max at 120 cols),
   * but 16KB is a snug safety rail that keeps Karton IPC payloads small
   * without truncating realistic live previews. The final command output
   * is unaffected — it uses the head+tail capped capture on a separate
   * code path.
   */
  private static readonly MAX_STREAMING_BYTES = 16_384;
  private static readonly MANIFEST_THROTTLE_MS = 500;

  constructor(
    logger: Logger,
    kartonService?: KartonService,
    preDetectedShell?: DetectedShell | null,
    preResolvedEnv?: Record<string, string> | null,
  ) {
    super();
    this.logger = logger;
    this.kartonService = kartonService;
    this.preDetectedShell = preDetectedShell ?? null;
    this.preResolvedEnv = preResolvedEnv ?? null;
  }

  public static async create(
    logger: Logger,
    kartonService?: KartonService,
    preDetectedShell?: DetectedShell | null,
    preResolvedEnv?: Record<string, string> | null,
  ): Promise<ShellService> {
    const instance = new ShellService(
      logger,
      kartonService,
      preDetectedShell,
      preResolvedEnv,
    );
    await instance.initialize();
    return instance;
  }

  async initialize() {
    this.shell = this.preDetectedShell ?? detectShell();
    if (this.shell) {
      this.logger.info(
        `[ShellService] Detected shell: ${this.shell.type} at ${this.shell.path}`,
      );

      // Use pre-resolved env if provided, otherwise resolve it now
      if (this.preResolvedEnv) {
        this.resolvedEnv = this.preResolvedEnv;
        this.logger.info('[ShellService] Using pre-resolved shell environment');
      } else {
        try {
          this.resolvedEnv = await resolveShellEnv(this.shell);
          if (this.resolvedEnv) {
            this.logger.info(
              '[ShellService] Resolved shell environment successfully',
            );
          } else {
            this.logger.warn(
              '[ShellService] Could not resolve shell environment — falling back to process.env',
            );
          }
        } catch (err) {
          this.logger.warn(
            '[ShellService] Error resolving shell environment — falling back to process.env',
            err,
          );
        }
      }

      this.sessionManager = new SessionManager(this.shell, (agentId) =>
        getAgentShellLogsDir(agentId),
      );
      this.sessionManager.onSessionStateChange = (agentInstanceId) => {
        this.pushShellsToKarton(agentInstanceId);
      };
    } else {
      this.logger.warn(
        '[ShellService] No usable shell detected — shell tool will be unavailable',
      );
    }
  }

  isAvailable(): boolean {
    return this.shell !== null;
  }

  getShellInfo(): DetectedShell | null {
    return this.shell;
  }

  /**
   * Execute a command in a persistent PTY session.
   *
   * If `request.sessionId` is provided, the command runs in that existing session.
   * Otherwise a new session is created (using `cwd` for the initial working directory).
   */
  async executeInSession(
    agentInstanceId: string,
    toolCallId: string,
    request: SessionCommandRequest & { cwd: string },
  ): Promise<SessionCommandResult> {
    this.assertNotDisposed();

    if (!this.shell || !this.sessionManager) {
      return {
        sessionId: '',
        output: 'Shell service is not available — no shell detected.',
        exitCode: null,
        sessionExited: true,
        timedOut: false,
        resolvedBy: 'session_exited',
      };
    }

    const env = sanitizeEnv(this.resolvedEnv, this.shell.type);

    // Build a streaming callback targeting the current toolCallId.
    // We no longer accumulate chunks — we just mark the tool call "dirty"
    // and let the flush read the current grid snapshot from the session.
    const makeOnData = (targetToolCallId: string, targetSessionId: string) => {
      return (_sid: string, _chunk: string) => {
        if (!this.kartonService) return;
        const entry = this.outputBuffers.get(targetToolCallId);
        if (entry) {
          entry.dirty = true;
        } else {
          this.outputBuffers.set(targetToolCallId, {
            sessionId: targetSessionId,
            dirty: true,
          });
        }
        this.scheduleFlush(agentInstanceId, targetToolCallId);
        this.scheduleShellManifestPush(agentInstanceId);
      };
    };

    // Reuse existing session or create a new one
    let sessionId = request.sessionId;
    if (!sessionId) {
      try {
        // Create with a no-op onData; wire the real callback immediately
        // after so we can close over the sessionId for snapshot reads.
        sessionId = this.sessionManager.createSession(
          agentInstanceId,
          request.cwd,
          env,
          () => {},
        );
        this.sessionManager.setOnData(
          sessionId,
          makeOnData(toolCallId, sessionId),
        );
      } catch (err) {
        return {
          sessionId: '',
          output:
            err instanceof Error
              ? err.message
              : 'Failed to create shell session.',
          exitCode: null,
          sessionExited: true,
          timedOut: false,
          resolvedBy: 'session_exited',
        };
      }
    } else {
      // Re-target streaming output to the current tool call
      this.sessionManager.setOnData(
        sessionId,
        makeOnData(toolCallId, sessionId),
      );
    }

    // Push updated session manifest to Karton state on new session creation
    if (!request.sessionId) {
      this.pushShellsToKarton(agentInstanceId);
    }

    // Publish session ID to Karton state so the UI can cancel in-flight commands
    if (this.kartonService) {
      this.kartonService.setState((draft) => {
        if (!draft.toolbox[agentInstanceId]) {
          draft.toolbox[agentInstanceId] = {
            workspace: { mounts: [] },
            pendingFileDiffs: [],
            editSummary: [],
            pendingUserQuestion: null,
          };
        }
        if (!draft.toolbox[agentInstanceId].pendingShellSessionIds) {
          draft.toolbox[agentInstanceId].pendingShellSessionIds = {};
        }
        draft.toolbox[agentInstanceId].pendingShellSessionIds![toolCallId] =
          sessionId!;
      });
    }

    return this.sessionManager.executeCommand(sessionId, request);
  }

  /**
   * Returns the tail of the session's captured output (at most `maxLines`
   * lines). Intended for downstream classifiers that need a glimpse of the
   * current shell state to reason about whether a proposed next command is
   * safe (e.g. detecting interactive prompts). Returns `undefined` for
   * unknown sessions.
   */
  public getRecentOutputForClassifier(
    sessionId: string,
    maxLines: number,
  ): string | undefined {
    if (!this.sessionManager) return undefined;
    const raw = this.sessionManager.getRecentOutput(sessionId);
    if (!raw) return undefined;
    const lines = raw.split('\n');
    if (lines.length <= maxLines) return raw;
    return lines.slice(-maxLines).join('\n');
  }

  clearPendingOutputs(agentId: string, toolCallId: string): void {
    this.outputBuffers.delete(toolCallId);

    const debounce = this.outputFlushTimers.get(toolCallId);
    if (debounce) {
      clearTimeout(debounce);
      this.outputFlushTimers.delete(toolCallId);
    }
    const maxInterval = this.outputMaxIntervalTimers.get(toolCallId);
    if (maxInterval) {
      clearTimeout(maxInterval);
      this.outputMaxIntervalTimers.delete(toolCallId);
    }

    if (!this.kartonService) return;
    const agentToolbox = this.kartonService.state.toolbox[agentId];
    const hasOutputs = !!agentToolbox?.pendingShellOutputs?.[toolCallId];
    const hasSessionId = !!agentToolbox?.pendingShellSessionIds?.[toolCallId];
    if (!hasOutputs && !hasSessionId) return;

    this.kartonService.setState((draft) => {
      const tb = draft.toolbox[agentId];
      if (tb?.pendingShellOutputs?.[toolCallId]) {
        delete tb.pendingShellOutputs[toolCallId];
      }
      if (tb?.pendingShellSessionIds?.[toolCallId]) {
        delete tb.pendingShellSessionIds[toolCallId];
      }
    });
  }

  killSession(sessionId: string): boolean {
    return this.sessionManager?.killSession(sessionId) ?? false;
  }

  destroyAgent(agentInstanceId: string): void {
    this.sessionManager?.destroyAgent(agentInstanceId);
  }

  getShellSnapshot(agentInstanceId: string): ShellSnapshot {
    if (!this.sessionManager) {
      return { sessions: [] };
    }
    const sessions = this.sessionManager.getSessionsForAgent(agentInstanceId);
    const TAIL_CHARS = 400;
    const snapshot: ShellSnapshot = {
      sessions: sessions.map((s) => {
        const lineCount = s.logger?.lineCount ?? 0;
        const logPath = s.logger
          ? `shells/${path.basename(s.logger.filePath)}`
          : '';
        const tailContent =
          lineCount > 0 && s.logger ? s.logger.getTail(TAIL_CHARS) : undefined;
        return {
          id: s.id,
          exited: s.exited,
          exitCode: s.exitCode,
          lineCount,
          logPath,
          tailContent: tailContent || undefined,
          lastLine: s.logger?.getLastLine() || undefined,
          cwd: s.cwd,
          createdAt: s.createdAt,
        };
      }),
    };
    return snapshot;
  }

  private pushShellsToKarton(agentInstanceId: string): void {
    if (!this.kartonService) return;
    const snapshot = this.getShellSnapshot(agentInstanceId);
    this.kartonService.setState((draft) => {
      if (!draft.toolbox[agentInstanceId]) {
        draft.toolbox[agentInstanceId] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      }
      draft.toolbox[agentInstanceId].shells = snapshot;
    });
  }

  /**
   * Leading+trailing edge throttled push of the shells manifest to Karton.
   * Pushes immediately on the first call, then suppresses for
   * MANIFEST_THROTTLE_MS, then pushes once more (trailing edge) to
   * capture the latest state.
   */
  private scheduleShellManifestPush(agentId: string): void {
    if (this.shellManifestTimers.has(agentId)) return;
    // Leading edge — push immediately
    this.pushShellsToKarton(agentId);
    // Cooldown — trailing edge fires after the interval
    this.shellManifestTimers.set(
      agentId,
      setTimeout(() => {
        this.shellManifestTimers.delete(agentId);
        this.pushShellsToKarton(agentId);
      }, ShellService.MANIFEST_THROTTLE_MS),
    );
  }

  deleteShellLogs(agentInstanceId: string): void {
    void fs.rm(getAgentShellLogsDir(agentInstanceId), {
      recursive: true,
      force: true,
    });
  }

  private scheduleFlush(agentId: string, toolCallId: string): void {
    const existingDebounce = this.outputFlushTimers.get(toolCallId);
    if (existingDebounce) clearTimeout(existingDebounce);

    this.outputFlushTimers.set(
      toolCallId,
      setTimeout(
        () => this.flushToKarton(agentId, toolCallId),
        ShellService.FLUSH_DEBOUNCE_MS,
      ),
    );

    if (!this.outputMaxIntervalTimers.has(toolCallId)) {
      this.outputMaxIntervalTimers.set(
        toolCallId,
        setTimeout(
          () => this.flushToKarton(agentId, toolCallId),
          ShellService.FLUSH_MAX_INTERVAL_MS,
        ),
      );
    }
  }

  private flushToKarton(agentId: string, toolCallId: string): void {
    if (!this.kartonService) return;

    const debounce = this.outputFlushTimers.get(toolCallId);
    if (debounce) {
      clearTimeout(debounce);
      this.outputFlushTimers.delete(toolCallId);
    }
    const maxInterval = this.outputMaxIntervalTimers.get(toolCallId);
    if (maxInterval) {
      clearTimeout(maxInterval);
      this.outputMaxIntervalTimers.delete(toolCallId);
    }

    const entry = this.outputBuffers.get(toolCallId);
    if (!entry?.dirty) return;

    // Read the current grid snapshot from the session. If the command has
    // already resolved (pattern match, timeout, exit) the snapshot will be
    // null and we clear any stale Karton entry.
    const snapshot = this.sessionManager?.getLiveOutputSnapshot(
      entry.sessionId,
    );

    if (snapshot == null) {
      this.kartonService.setState((draft) => {
        const tb = draft.toolbox[agentId];
        if (tb?.pendingShellOutputs?.[toolCallId]) {
          delete tb.pendingShellOutputs[toolCallId];
        }
      });
      entry.dirty = false;
      return;
    }

    const capped =
      snapshot.length > ShellService.MAX_STREAMING_BYTES
        ? snapshot.slice(-ShellService.MAX_STREAMING_BYTES)
        : snapshot;

    this.kartonService.setState((draft) => {
      if (!draft.toolbox[agentId]) {
        draft.toolbox[agentId] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      }
      if (!draft.toolbox[agentId].pendingShellOutputs) {
        draft.toolbox[agentId].pendingShellOutputs = {};
      }
      draft.toolbox[agentId].pendingShellOutputs![toolCallId] = [capped];
    });
    entry.dirty = false;
  }

  protected onTeardown(): Promise<void> | void {
    this.sessionManager?.killAll();
    this.sessionManager = null;

    for (const timer of this.outputFlushTimers.values()) clearTimeout(timer);

    this.outputFlushTimers.clear();
    for (const timer of this.outputMaxIntervalTimers.values())
      clearTimeout(timer);

    this.outputMaxIntervalTimers.clear();
    this.outputBuffers.clear();

    for (const timer of this.shellManifestTimers.values()) clearTimeout(timer);
    this.shellManifestTimers.clear();
  }
}

// Re-export for use by other services (e.g. LSP env resolution)
export { detectShell } from './detect-shell';
export { resolveShellEnv } from './resolve-shell-env';
export type { DetectedShell } from './types';
