import { DisposableService } from '../../../disposable';
import type { Logger } from '../../../logger';
import type { KartonService } from '@/services/karton';
import { detectShell } from './detect-shell';
import { resolveShellEnv } from './resolve-shell-env';
import { sanitizeEnv } from './sanitize-env';
import { SessionManager, stripAnsi } from './session-manager';
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

  private readonly outputBuffers = new Map<string, string[]>();
  private readonly outputFlushTimers = new Map<string, NodeJS.Timeout>();
  private readonly outputMaxIntervalTimers = new Map<string, NodeJS.Timeout>();

  /** Per-agent throttle timers for pushing the shells manifest to Karton. */
  private readonly shellManifestTimers = new Map<string, NodeJS.Timeout>();

  /** Session IDs with an open terminal viewer — their raw PTY bytes are pushed to Karton. */
  private readonly activeTerminalSessions = new Set<string>();
  /** Buffered base64 terminal chunks awaiting flush, keyed by sessionId. */
  private readonly terminalChunkBuffers = new Map<string, string[]>();
  private readonly terminalFlushTimers = new Map<string, NodeJS.Timeout>();
  private readonly terminalMaxIntervalTimers = new Map<
    string,
    NodeJS.Timeout
  >();

  private static readonly FLUSH_DEBOUNCE_MS = 100;
  private static readonly FLUSH_MAX_INTERVAL_MS = 300;
  private static readonly MAX_STREAMING_BYTES = 51_200;
  private static readonly MANIFEST_THROTTLE_MS = 500;
  private static readonly TERMINAL_FLUSH_DEBOUNCE_MS = 100;
  private static readonly TERMINAL_FLUSH_MAX_INTERVAL_MS = 300;

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
        // Final-flush terminal chunks for any exited sessions being streamed
        if (this.sessionManager) {
          for (const s of this.sessionManager.getSessionsForAgent(
            agentInstanceId,
          )) {
            if (s.exited && this.activeTerminalSessions.has(s.id)) {
              this.flushTerminalToKarton(agentInstanceId, s.id);
              this.activeTerminalSessions.delete(s.id);
            }
          }
        }
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
      };
    }

    const env = sanitizeEnv(this.resolvedEnv);

    // Build a streaming callback targeting the current toolCallId
    const makeOnData = (targetToolCallId: string) => {
      return (sid: string, chunk: string) => {
        if (!this.kartonService) return;
        if (!this.outputBuffers.has(targetToolCallId)) {
          this.outputBuffers.set(targetToolCallId, []);
        }
        this.outputBuffers.get(targetToolCallId)!.push(stripAnsi(chunk));
        this.scheduleFlush(agentInstanceId, targetToolCallId);
        this.scheduleShellManifestPush(agentInstanceId);
        // Forward raw bytes to terminal viewers (only when a page is streaming)
        const isStreaming = this.activeTerminalSessions.has(sid);
        if (isStreaming) {
          this.bufferTerminalChunk(agentInstanceId, sid, chunk);
        }
      };
    };

    // Reuse existing session or create a new one
    let sessionId = request.sessionId;
    if (!sessionId) {
      try {
        sessionId = this.sessionManager.createSession(
          agentInstanceId,
          request.cwd,
          env,
          makeOnData(toolCallId),
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
        };
      }
    } else {
      // Re-target streaming output to the current tool call
      this.sessionManager.setOnData(sessionId, makeOnData(toolCallId));
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

  killSession(sessionId: string): boolean {
    return this.sessionManager?.killSession(sessionId) ?? false;
  }

  destroyAgent(agentInstanceId: string): void {
    // Clean up terminal streams for this agent's sessions
    if (this.sessionManager) {
      for (const s of this.sessionManager.getSessionsForAgent(agentInstanceId))
        this.cleanupTerminalStream(agentInstanceId, s.id);
    }
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

  // ─── Terminal replay & streaming ─────────────────────────────

  getShellReplayBuffer(
    agentInstanceId: string,
    sessionId: string,
  ): {
    found: boolean;
    data: string;
    exited: boolean;
    exitCode: number | null;
  } {
    if (!this.sessionManager)
      return { found: false, data: '', exited: true, exitCode: null };

    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId)
      return { found: false, data: '', exited: true, exitCode: null };

    const raw = session.logger?.getRawBuffer() ?? Buffer.alloc(0);
    return {
      found: true,
      data: raw.toString('base64'),
      exited: session.exited,
      exitCode: session.exitCode,
    };
  }

  openTerminalStream(agentInstanceId: string, sessionId: string): void {
    if (!this.sessionManager) return;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) return;
    this.activeTerminalSessions.add(sessionId);
  }

  closeTerminalStream(agentInstanceId: string, sessionId: string): void {
    this.cleanupTerminalStream(agentInstanceId, sessionId);
  }

  resizeTerminal(
    agentInstanceId: string,
    sessionId: string,
    cols: number,
    rows: number,
  ): void {
    if (!this.sessionManager) return;
    const session = this.sessionManager.getSession(sessionId);
    if (!session || session.agentInstanceId !== agentInstanceId) return;
    this.sessionManager.resizeSession(sessionId, cols, rows);
  }

  private cleanupTerminalStream(
    agentInstanceId: string,
    sessionId: string,
  ): void {
    this.activeTerminalSessions.delete(sessionId);
    this.terminalChunkBuffers.delete(sessionId);

    const debounce = this.terminalFlushTimers.get(sessionId);
    if (debounce) {
      clearTimeout(debounce);
      this.terminalFlushTimers.delete(sessionId);
    }
    const maxInterval = this.terminalMaxIntervalTimers.get(sessionId);
    if (maxInterval) {
      clearTimeout(maxInterval);
      this.terminalMaxIntervalTimers.delete(sessionId);
    }

    // Clear from Karton state
    if (!this.kartonService) return;
    const toolbox = this.kartonService.state.toolbox[agentInstanceId];
    if (!toolbox?.pendingShellTerminalChunks?.[sessionId]) return;
    this.kartonService.setState((draft) => {
      const tb = draft.toolbox[agentInstanceId];
      if (tb?.pendingShellTerminalChunks?.[sessionId])
        delete tb.pendingShellTerminalChunks[sessionId];
    });
  }

  private bufferTerminalChunk(
    agentInstanceId: string,
    sessionId: string,
    rawChunk: string,
  ): void {
    if (!this.activeTerminalSessions.has(sessionId)) return;

    const b64 = Buffer.from(rawChunk, 'utf-8').toString('base64');
    if (!this.terminalChunkBuffers.has(sessionId))
      this.terminalChunkBuffers.set(sessionId, []);

    this.terminalChunkBuffers.get(sessionId)!.push(b64);
    this.scheduleTerminalFlush(agentInstanceId, sessionId);
  }

  private scheduleTerminalFlush(agentId: string, sessionId: string): void {
    const existingDebounce = this.terminalFlushTimers.get(sessionId);
    if (existingDebounce) clearTimeout(existingDebounce);

    this.terminalFlushTimers.set(
      sessionId,
      setTimeout(
        () => this.flushTerminalToKarton(agentId, sessionId),
        ShellService.TERMINAL_FLUSH_DEBOUNCE_MS,
      ),
    );

    if (!this.terminalMaxIntervalTimers.has(sessionId)) {
      this.terminalMaxIntervalTimers.set(
        sessionId,
        setTimeout(
          () => this.flushTerminalToKarton(agentId, sessionId),
          ShellService.TERMINAL_FLUSH_MAX_INTERVAL_MS,
        ),
      );
    }
  }

  private flushTerminalToKarton(agentId: string, sessionId: string): void {
    if (!this.kartonService) return;

    const debounce = this.terminalFlushTimers.get(sessionId);
    if (debounce) {
      clearTimeout(debounce);
      this.terminalFlushTimers.delete(sessionId);
    }
    const maxInterval = this.terminalMaxIntervalTimers.get(sessionId);
    if (maxInterval) {
      clearTimeout(maxInterval);
      this.terminalMaxIntervalTimers.delete(sessionId);
    }

    const chunks = this.terminalChunkBuffers.get(sessionId);
    if (!chunks?.length) return;
    const snapshot = [...chunks];
    chunks.length = 0;

    this.kartonService.setState((draft) => {
      if (!draft.toolbox[agentId]) {
        draft.toolbox[agentId] = {
          workspace: { mounts: [] },
          pendingFileDiffs: [],
          editSummary: [],
          pendingUserQuestion: null,
        };
      }
      if (!draft.toolbox[agentId].pendingShellTerminalChunks)
        draft.toolbox[agentId].pendingShellTerminalChunks = {};

      draft.toolbox[agentId].pendingShellTerminalChunks![sessionId] = snapshot;
    });
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

    const outputs = this.outputBuffers.get(toolCallId);
    if (!outputs?.length) return;

    let snapshot: string[];
    const joined = outputs.join('');
    if (joined.length > ShellService.MAX_STREAMING_BYTES)
      snapshot = [joined.slice(-ShellService.MAX_STREAMING_BYTES)];
    else snapshot = [...outputs];

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

      draft.toolbox[agentId].pendingShellOutputs![toolCallId] = snapshot;
    });
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

    for (const timer of this.terminalFlushTimers.values()) clearTimeout(timer);
    this.terminalFlushTimers.clear();
    for (const timer of this.terminalMaxIntervalTimers.values())
      clearTimeout(timer);
    this.terminalMaxIntervalTimers.clear();
    this.terminalChunkBuffers.clear();
    this.activeTerminalSessions.clear();
  }
}

// Re-export for use by other services (e.g. LSP env resolution)
export { detectShell } from './detect-shell';
export { resolveShellEnv } from './resolve-shell-env';
export type { DetectedShell } from './types';
