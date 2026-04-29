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
import os from 'node:os';
import { existsSync, statSync } from 'node:fs';
import type { ShellSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import {
  USER_OWNER_ID,
  type DetectedShell,
  type SessionCommandRequest,
  type SessionCommandResult,
} from './types';

export class ShellService extends DisposableService {
  private readonly logger: Logger;
  private readonly kartonService?: KartonService;

  private shell: DetectedShell | null = null;
  private sessionManager: SessionManager | null = null;
  private resolvedEnv: Record<string, string> | null = null;

  private readonly preDetectedShell: DetectedShell | null;
  private readonly preResolvedEnv: Record<string, string> | null;

  // Per-tool-call streaming bookkeeping. We don't accumulate chunks —
  // we mark the tool call dirty and let the flush re-read the live grid.
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
  // Safety cap for the live preview Karton payload. Grid serialization
  // is already bounded by STREAMING_MAX_ROWS; 16 KiB is a comfortable
  // ceiling. The final command output uses a separate head+tail path.
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

    // Streaming hook for this tool call. Marks the buffer dirty; flush
    // re-reads the live grid snapshot.
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
        // Create with a no-op then wire the real callback so it can
        // close over the freshly-minted sessionId.
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

  killSession(sessionId: string, expectedOwner?: string): boolean {
    return this.sessionManager?.killSession(sessionId, expectedOwner) ?? false;
  }

  /**
   * Drop an (already-exited or about-to-be-killed) session from the
   * in-memory map. Used by the user-facing terminal sidebar to clear
   * "session ended" rows on demand. When `expectedOwner` is provided,
   * the operation is rejected if the session's owner doesn't match.
   */
  removeSession(sessionId: string, expectedOwner?: string): boolean {
    return (
      this.sessionManager?.removeSession(sessionId, expectedOwner) ?? false
    );
  }

  /** Tail read for the terminal page, base64-encoded. Scoped by owner. */
  readShellTail(
    agentInstanceId: string,
    sessionId: string,
    cursor: number,
  ): {
    data: string;
    cursor: number;
    truncated: boolean;
    exited: boolean;
    exitCode: number | null;
    agentBusy: boolean;
  } | null {
    if (!this.sessionManager) return null;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) return null;
    const result = this.sessionManager.readRawSinceCursor(sessionId, cursor);
    if (!result) return null;
    return {
      data: result.data.toString('base64'),
      cursor: result.cursor,
      truncated: result.truncated,
      exited: result.exited,
      exitCode: result.exitCode,
      agentBusy: this.sessionManager.hasPendingCommand(sessionId),
    };
  }

  /**
   * Stdin write from the terminal page. Returns `'agent_busy'` while
   * the agent owns the PTY — letting keystrokes through there would
   * corrupt the agent's pattern/idle/exit-code parsing.
   */
  writeShellStdin(
    agentInstanceId: string,
    sessionId: string,
    bytes: string,
  ): 'ok' | 'agent_busy' | 'session_not_found' | 'session_exited' {
    if (!this.sessionManager) return 'session_not_found';
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) {
      return 'session_not_found';
    }
    if (this.sessionManager.hasPendingCommand(sessionId)) {
      return 'agent_busy';
    }
    return this.sessionManager.writeUserStdin(sessionId, bytes);
  }

  /**
   * Resize the PTY to match the viewport. Allowed even while the agent
   * is busy — it's a passive signal, not an input event.
   */
  resizeShellSession(
    agentInstanceId: string,
    sessionId: string,
    cols: number,
    rows: number,
  ): boolean {
    if (!this.sessionManager) return false;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) return false;
    return this.sessionManager.resizeSession(sessionId, cols, rows);
  }

  /** Header metadata for the terminal page. Scoped by owner. */
  getShellSessionInfo(
    agentInstanceId: string,
    sessionId: string,
  ): {
    id: string;
    cwd: string;
    shellType: DetectedShell['type'];
    shellPath: string;
    createdAt: number;
    exited: boolean;
    exitCode: number | null;
  } | null {
    if (!this.sessionManager || !this.shell) return null;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) return null;
    return {
      id: session.id,
      cwd: session.cwd,
      shellType: this.shell.type,
      shellPath: this.shell.path,
      createdAt: session.createdAt,
      exited: session.exited,
      exitCode: session.exitCode,
    };
  }

  destroyAgent(agentInstanceId: string): void {
    this.sessionManager?.destroyAgent(agentInstanceId);
  }

  // ─── User-created (agent-independent) sessions ───────────────────

  /**
   * Spawn a user-owned session ({@link USER_OWNER_ID} as the owner id).
   * `requestedCwd` is a hint — falls back to home if it's not a real dir.
   */
  createUserShellSession(requestedCwd: string | null):
    | { ok: true; sessionId: string }
    | {
        ok: false;
        reason: 'unavailable' | 'cap_reached' | 'spawn_failed';
        message: string;
      } {
    if (!this.shell || !this.sessionManager) {
      return {
        ok: false,
        reason: 'unavailable',
        message: 'No shell is available on this system.',
      };
    }
    const cwd = resolveExistingDir(requestedCwd) ?? os.homedir();
    const env = sanitizeEnv(this.resolvedEnv, this.shell.type);
    try {
      // Wire onData so the sidebar's lastLine stays live. Without it
      // the manifest only updates on create/exit and the row would
      // look frozen. The throttled helper keeps high-traffic TUIs from
      // flooding karton.
      const sessionId = this.sessionManager.createSession(
        USER_OWNER_ID,
        cwd,
        env,
        () => {
          this.scheduleShellManifestPush(USER_OWNER_ID);
        },
      );
      return { ok: true, sessionId };
    } catch (err) {
      this.logger.warn(
        '[ShellService] Failed to create user shell session',
        err,
      );
      const message =
        err instanceof Error ? err.message : 'Failed to create terminal.';
      const reason: 'cap_reached' | 'spawn_failed' = message.startsWith(
        'Maximum',
      )
        ? 'cap_reached'
        : 'spawn_failed';
      return { ok: false, reason, message };
    }
  }

  /** User-owned sessions, including exited-but-not-yet-cleared rows. */
  listUserShellSessions(): Array<{
    id: string;
    cwd: string;
    createdAt: number;
    exited: boolean;
    exitCode: number | null;
    lastLine: string | null;
  }> {
    if (!this.sessionManager) return [];
    return this.sessionManager.getSessionsForAgent(USER_OWNER_ID).map((s) => ({
      id: s.id,
      cwd: s.cwd,
      createdAt: s.createdAt,
      exited: s.exited,
      exitCode: s.exitCode,
      lastLine: s.logger?.getLastLine() ?? null,
    }));
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

  /** Leading+trailing throttled manifest push (push, cool down, push again). */
  private scheduleShellManifestPush(agentId: string): void {
    if (this.shellManifestTimers.has(agentId)) return;
    this.pushShellsToKarton(agentId); // leading edge
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

    // Snapshot the live grid. Null means the command already resolved —
    // clear any stale karton entry in that case.
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

/** Returns the hint if it's a real directory, else null. Guards spawn against stale paths. */
function resolveExistingDir(hint: string | null): string | null {
  if (!hint) return null;
  try {
    if (existsSync(hint) && statSync(hint).isDirectory()) return hint;
  } catch {
    // unreadable — treat as missing
  }
  return null;
}

// Re-exported for other services (e.g. LSP env resolution).
export { detectShell } from './detect-shell';
export { resolveShellEnv } from './resolve-shell-env';
export type { DetectedShell } from './types';
