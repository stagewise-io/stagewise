import { DisposableService } from './disposable';
import type { Logger } from './logger';
import type { ShellStreamSink } from './stream-sink';
import { detectShell, resolveShellEnv } from './shell-env';
import { sanitizeEnv } from './sanitize-env';
import { SessionManager } from './session-manager';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ShellSnapshot } from '../schemas';
import type {
  DetectedShell,
  SessionCommandRequest,
  SessionCommandResult,
} from './types';

export class ShellService extends DisposableService {
  private readonly logger: Logger;
  private readonly sink?: ShellStreamSink;
  private readonly getShellLogsDir: (agentInstanceId: string) => string;

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

  /** Per-agent throttle timers for pushing the shells manifest to the sink. */
  private readonly shellManifestTimers = new Map<string, NodeJS.Timeout>();

  private static readonly FLUSH_DEBOUNCE_MS = 100;
  private static readonly FLUSH_MAX_INTERVAL_MS = 300;
  /**
   * Per-flush cap for the live UI snapshot. Grid serialization is already
   * bounded by `STREAMING_MAX_ROWS` (~24KB theoretical max at 120 cols),
   * but 16KB is a snug safety rail that keeps live-stream IPC payloads
   * small without truncating realistic live previews. The final command
   * output is unaffected — it uses the head+tail capped capture on a
   * separate code path.
   */
  private static readonly MAX_STREAMING_BYTES = 16_384;
  private static readonly MANIFEST_THROTTLE_MS = 500;

  constructor(
    logger: Logger,
    getShellLogsDir: (agentInstanceId: string) => string,
    sink?: ShellStreamSink,
    preDetectedShell?: DetectedShell | null,
    preResolvedEnv?: Record<string, string> | null,
  ) {
    super();
    this.logger = logger;
    this.getShellLogsDir = getShellLogsDir;
    this.sink = sink;
    this.preDetectedShell = preDetectedShell ?? null;
    this.preResolvedEnv = preResolvedEnv ?? null;
  }

  public static async create(
    logger: Logger,
    getShellLogsDir: (agentInstanceId: string) => string,
    sink?: ShellStreamSink,
    preDetectedShell?: DetectedShell | null,
    preResolvedEnv?: Record<string, string> | null,
  ): Promise<ShellService> {
    const instance = new ShellService(
      logger,
      getShellLogsDir,
      sink,
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
        this.getShellLogsDir(agentId),
      );
      this.sessionManager.onSessionStateChange = (agentInstanceId) => {
        this.pushShellsToSink(agentInstanceId);
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
   * Create a new PTY session without executing any command.
   * Returns immediately with the session ID — does not wait for shell init.
   */
  createSession(
    agentInstanceId: string,
    toolCallId: string,
    cwd: string,
  ): string {
    this.assertNotDisposed();

    if (!this.shell || !this.sessionManager) {
      throw new Error('Shell service is not available — no shell detected.');
    }

    const env = sanitizeEnv(this.resolvedEnv, this.shell.type);
    const sessionId = this.sessionManager.createSession(
      agentInstanceId,
      cwd,
      env,
      () => {},
    );

    // Wire streaming callback
    this.sessionManager.setOnData(sessionId, (_sid: string, _chunk: string) => {
      if (!this.sink) return;
      const entry = this.outputBuffers.get(toolCallId);
      if (entry) {
        entry.dirty = true;
      } else {
        this.outputBuffers.set(toolCallId, {
          sessionId,
          dirty: true,
        });
      }
      this.scheduleFlush(agentInstanceId, toolCallId);
      this.scheduleShellManifestPush(agentInstanceId);
    });

    this.pushShellsToSink(agentInstanceId);

    // Publish session ID to the stream sink so the UI can cancel in-flight
    // commands.
    this.sink?.publishSessionId(agentInstanceId, toolCallId, sessionId);

    return sessionId;
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
    request: SessionCommandRequest,
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
        if (!this.sink) return;
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
          request.cwd ?? '',
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

    // Push updated session manifest on new session creation
    if (!request.sessionId) {
      this.pushShellsToSink(agentInstanceId);
    }

    // Publish session ID to the stream sink so the UI can cancel in-flight
    // commands.
    this.sink?.publishSessionId(agentInstanceId, toolCallId, sessionId);

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

  /** Returns the latest shell-reported cwd for a session, when known. */
  public getSessionCurrentCwd(sessionId: string): string | undefined {
    return this.sessionManager?.getCurrentCwd(sessionId);
  }

  public getSessionCwd(sessionId: string): string | undefined {
    return this.sessionManager?.getSessionCwd(sessionId);
  }

  /** Returns the root PTY pid used to associate local servers with sessions. */
  public getSessionProcessId(sessionId: string): number | undefined {
    return this.sessionManager?.getSession(sessionId)?.pty.pid;
  }

  public getSessionCommand(sessionId: string): string | undefined {
    return this.sessionManager?.getSession(sessionId)?.lastCommand ?? undefined;
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

    if (!this.sink) return;
    this.sink.clearPending(agentId, toolCallId);
  }

  writeSessionInput(sessionId: string, data: string): boolean {
    return this.sessionManager?.writeSessionInput(sessionId, data) ?? false;
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

  private pushShellsToSink(agentInstanceId: string): void {
    if (!this.sink) return;
    const snapshot = this.getShellSnapshot(agentInstanceId);
    this.sink.setManifest(agentInstanceId, snapshot);
  }

  /**
   * Leading+trailing edge throttled push of the shells manifest to the sink.
   * Pushes immediately on the first call, then suppresses for
   * MANIFEST_THROTTLE_MS, then pushes once more (trailing edge) to
   * capture the latest state.
   */
  private scheduleShellManifestPush(agentId: string): void {
    if (this.shellManifestTimers.has(agentId)) return;
    // Leading edge — push immediately
    this.pushShellsToSink(agentId);
    // Cooldown — trailing edge fires after the interval
    this.shellManifestTimers.set(
      agentId,
      setTimeout(() => {
        this.shellManifestTimers.delete(agentId);
        this.pushShellsToSink(agentId);
      }, ShellService.MANIFEST_THROTTLE_MS),
    );
  }

  deleteShellLogs(agentInstanceId: string): void {
    void fs.rm(this.getShellLogsDir(agentInstanceId), {
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
        () => this.flushToSink(agentId, toolCallId),
        ShellService.FLUSH_DEBOUNCE_MS,
      ),
    );

    if (!this.outputMaxIntervalTimers.has(toolCallId)) {
      this.outputMaxIntervalTimers.set(
        toolCallId,
        setTimeout(
          () => this.flushToSink(agentId, toolCallId),
          ShellService.FLUSH_MAX_INTERVAL_MS,
        ),
      );
    }
  }

  private flushToSink(agentId: string, toolCallId: string): void {
    if (!this.sink) return;

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
    // null and we clear any stale live-output entry.
    const snapshot = this.sessionManager?.getLiveOutputSnapshot(
      entry.sessionId,
    );

    if (snapshot == null) {
      this.sink.clearLiveOutput(agentId, toolCallId);
      entry.dirty = false;
      return;
    }

    const capped =
      snapshot.length > ShellService.MAX_STREAMING_BYTES
        ? snapshot.slice(-ShellService.MAX_STREAMING_BYTES)
        : snapshot;

    this.sink.publishLiveOutput(agentId, toolCallId, capped);
    entry.dirty = false;
  }

  protected onTeardown(): Promise<void> | void {
    // Capture count BEFORE killAll() so the log reflects how many PTYs
    // we actually had to tear down on shutdown. This is the signal we
    // need in crash reports to know the teardown path ran — absence of
    // this log line on a crash means the shutdown handler itself never
    // fired, not that the fix was insufficient.
    const killedCount = this.sessionManager?.getSessionCount() ?? 0;
    this.sessionManager?.killAll();
    this.sessionManager = null;
    this.logger.debug(
      `[ShellService] Teardown complete (killed ${killedCount} PTY session(s))`,
    );

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
