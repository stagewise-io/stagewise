import * as pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { OscParser, wrapWithSentinel } from './osc-parser';
import { SessionLogger } from './session-logger';
import {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS,
  HEAD_LINES,
  MAX_COLLECT_BYTES,
  MAX_SESSIONS_PER_AGENT,
  SESSION_EXIT_GRACE_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SHELL_INTEGRATION_DETECT_MS,
  TAIL_LINES,
  type DetectedShell,
  type PtySession,
  type SessionCommandRequest,
  type SessionCommandResult,
} from './types';

// ─── ANSI stripping ──────────────────────────────────────────────
// Strips ANSI/VT escape sequences from PTY output for clean text.
// CSI branch covers all ECMA-48 control sequences including DEC Private
// Mode (\x1b[?2004h) and intermediate-byte forms (\x1b[6 q).
const ANSI_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
  /\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-B]|\x1b[>=<78]|\r/g;

export function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

// ─── Head/tail output capping ────────────────────────────────────

export function applyHeadTailCap(lines: string[]): string {
  const total = HEAD_LINES + TAIL_LINES;
  if (lines.length <= total) return lines.join('\n');

  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(-TAIL_LINES);
  const truncated = lines.length - total;
  return [...head, `\n... [${truncated} lines truncated] ...\n`, ...tail].join(
    '\n',
  );
}

// ─── Shell integration scripts (inlined) ─────────────────────────
// These are sourced inside the PTY to enable OSC 133 markers.
// Inlined to avoid build-pipeline / path-resolution complexity.

const BASH_INTEGRATION = `
if [ -n "$__STAGEWISE_SHELL_INTEGRATION" ]; then return 0 2>/dev/null || true; fi
export __STAGEWISE_SHELL_INTEGRATION=1
__stagewise_command_executed=0
__stagewise_prompt_command() {
  local exit_code=$?
  if [ "$__stagewise_command_executed" = "1" ]; then
    printf '\\033]133;D;%d\\007' "$exit_code"
    __stagewise_command_executed=0
  fi
  printf '\\033]133;A\\007'
}
__stagewise_pre_exec() {
  if [ "$BASH_COMMAND" = "__stagewise_prompt_command" ]; then return; fi
  __stagewise_command_executed=1
  printf '\\033]133;B\\007'
  printf '\\033]133;C\\007'
}
trap '__stagewise_pre_exec' DEBUG
if [ -z "$PROMPT_COMMAND" ]; then
  PROMPT_COMMAND='__stagewise_prompt_command'
else
  PROMPT_COMMAND="__stagewise_prompt_command;\${PROMPT_COMMAND}"
fi
printf '\\033]133;A\\007'
`.trim();

const ZSH_INTEGRATION = `
if [[ -n "$__STAGEWISE_SHELL_INTEGRATION" ]]; then return 0 2>/dev/null || true; fi
export __STAGEWISE_SHELL_INTEGRATION=1
__stagewise_command_executed=0
autoload -Uz add-zsh-hook 2>/dev/null
__stagewise_precmd() {
  local exit_code=$?
  if [[ "$__stagewise_command_executed" == "1" ]]; then
    printf '\\033]133;D;%d\\007' "$exit_code"
    __stagewise_command_executed=0
  fi
  printf '\\033]133;A\\007'
}
__stagewise_preexec() {
  __stagewise_command_executed=1
  printf '\\033]133;B\\007'
  printf '\\033]133;C\\007'
}
if (( $+functions[add-zsh-hook] )); then
  add-zsh-hook precmd __stagewise_precmd
  add-zsh-hook preexec __stagewise_preexec
else
  precmd_functions+=(__stagewise_precmd)
  preexec_functions+=(__stagewise_preexec)
fi
printf '\\033]133;A\\007'
`.trim();

const POWERSHELL_INTEGRATION = `
if ((Test-Path variable:global:__StagewiseState) -and $null -ne $Global:__StagewiseState.OriginalPrompt) {
  return
}
if ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage") {
  return
}
$Global:__StagewiseState = @{
  OriginalPrompt = $function:Prompt
  LastHistoryId  = -1
  IsInExecution  = $false
}
function Global:Prompt() {
  $FakeCode = [int]!$global:?
  Set-StrictMode -Off
  $LastHistoryEntry = Get-History -Count 1
  $Result = ""
  if ($Global:__StagewiseState.LastHistoryId -ne -1 -and ($Global:__StagewiseState.HasPSReadLine -eq $false -or $Global:__StagewiseState.IsInExecution -eq $true)) {
    $Global:__StagewiseState.IsInExecution = $false
    if ($LastHistoryEntry.Id -eq $Global:__StagewiseState.LastHistoryId) {
      $Result += "$([char]0x1b)]133;D\`a"
    } else {
      $Result += "$([char]0x1b)]133;D;$FakeCode\`a"
    }
  }
  $Result += "$([char]0x1b)]133;A\`a"
  if ($FakeCode -ne 0) { Write-Error "failure" -ea ignore }
  $Result += $Global:__StagewiseState.OriginalPrompt.Invoke()
  $Result += "$([char]0x1b)]133;B\`a"
  $Global:__StagewiseState.LastHistoryId = $LastHistoryEntry.Id
  return $Result
}
$Global:__StagewiseState.HasPSReadLine = $false
if (Get-Module -Name PSReadLine) {
  $Global:__StagewiseState.HasPSReadLine = $true
  $Global:__StagewiseState.OriginalPSConsoleHostReadLine = $function:PSConsoleHostReadLine
  function Global:PSConsoleHostReadLine {
    $CommandLine = $Global:__StagewiseState.OriginalPSConsoleHostReadLine.Invoke()
    $Global:__StagewiseState.IsInExecution = $true
    [Console]::Write("$([char]0x1b)]133;C\`a")
    $CommandLine
  }
}
`.trim();

// ─── Pending command state ───────────────────────────────────────

interface PendingCommand {
  resolve: (result: SessionCommandResult) => void;
  sessionId: string;
  commandId: string;
  outputLines: string[];
  collectedBytes: number;
  truncatedEarly: boolean;
  timeoutHandle: NodeJS.Timeout | null;
  abortHandler: (() => void) | null;
  waitUntil?: SessionCommandRequest['waitUntil'];
  /** Accumulated raw output for pattern matching */
  rawOutput: string;
}

// ─── SessionManager ──────────────────────────────────────────────

export class SessionManager {
  private readonly shell: DetectedShell;
  private readonly sessions = new Map<string, PtySession>();
  private readonly pendingCommands = new Map<string, PendingCommand>();
  /** Maps sessionId → latest pending command ID */
  private readonly sessionCommandMap = new Map<string, string>();
  /** Optional factory that resolves the shell-logs directory for an agent. */
  private readonly getShellLogsDir:
    | ((agentInstanceId: string) => string)
    | null;

  constructor(
    shell: DetectedShell,
    getShellLogsDir?: (agentInstanceId: string) => string,
  ) {
    this.shell = shell;
    this.getShellLogsDir = getShellLogsDir ?? null;
  }

  // ─── Session creation ────────────────────────────────────────

  createSession(
    agentInstanceId: string,
    cwd: string,
    env: Record<string, string>,
    onData?: (sessionId: string, data: string) => void,
  ): string {
    // Enforce max sessions per agent
    const agentSessionCount = this.getSessionCountForAgent(agentInstanceId);
    if (agentSessionCount >= MAX_SESSIONS_PER_AGENT) {
      throw new Error(
        `Maximum ${MAX_SESSIONS_PER_AGENT} concurrent sessions per agent. ` +
          'Kill an existing session first.',
      );
    }

    const sessionId = randomUUID().slice(0, 8);

    const spawnArgs = this.getSpawnArgs();
    const ptyProcess = pty.spawn(this.shell.path, spawnArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd,
      env: { ...env, TERM: 'xterm-256color' },
    });

    const parser = new OscParser();

    const session: PtySession = {
      id: sessionId,
      agentInstanceId,
      pty: ptyProcess,
      parser,
      shellIntegrationActive: false,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      exited: false,
      exitCode: null,
      idleTimerHandle: null,
      graceTimerHandle: null,
      detectTimerHandle: null,
      ready: false,
      readyPromise: null!,
      readyResolve: null!,
      onData: onData ?? null,
      logger: this.getShellLogsDir
        ? new SessionLogger(
            path.join(
              this.getShellLogsDir(agentInstanceId),
              `${sessionId}.shell.log`,
            ),
          )
        : null,
    };

    // Wire ready promise
    session.readyPromise = new Promise<void>((resolve) => {
      session.readyResolve = resolve;
    });

    this.sessions.set(sessionId, session);

    // Wire PTY data → parser
    ptyProcess.onData((data: string) => {
      parser.write(data);
      // Only forward output to the agent/UI once the session is ready
      // (i.e. after the integration script has been consumed).
      if (session.ready) {
        session.onData?.(sessionId, data);
        session.logger?.append(stripAnsi(data));
      }
    });

    // Wire PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.handleSessionExit(sessionId, exitCode);
    });

    // Wire parser events
    parser.on('integrationDetected', () => {
      session.shellIntegrationActive = true;
      this.markReady(session);
      if (session.detectTimerHandle) {
        clearTimeout(session.detectTimerHandle);
        session.detectTimerHandle = null;
      }
    });

    parser.on('commandDone', (event) => {
      this.resolveCurrentCommand(sessionId, event.output, event.exitCode);
    });

    parser.on('sentinelDone', (id, exitCode) => {
      const pending = this.pendingCommands.get(id);
      if (pending) {
        this.resolveCommand(id, exitCode);
      }
    });

    parser.on('output', (data) => {
      this.appendToCommandOutput(sessionId, data);
    });

    // Start shell integration detection timer
    session.detectTimerHandle = setTimeout(() => {
      session.detectTimerHandle = null;
      if (!session.shellIntegrationActive) {
        parser.setMode('sentinel');
      }
      this.markReady(session);
    }, SHELL_INTEGRATION_DETECT_MS);

    // Source shell integration script
    this.sourceShellIntegration(session);

    // Start idle timeout
    this.resetIdleTimer(sessionId);

    return sessionId;
  }

  // ─── Command execution ───────────────────────────────────────

  async executeCommand(
    sessionId: string,
    request: SessionCommandRequest,
  ): Promise<SessionCommandResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        sessionId,
        output: `Session "${sessionId}" not found.`,
        exitCode: null,
        sessionExited: true,
        timedOut: false,
      };
    }

    if (session.exited) {
      return {
        sessionId,
        output: `Session "${sessionId}" has already exited (code ${session.exitCode}).`,
        exitCode: session.exitCode,
        sessionExited: true,
        timedOut: false,
      };
    }

    // Wait for the session to be ready (integration script consumed)
    await session.readyPromise;

    // Re-check: the session may have exited while we were waiting
    if (session.exited) {
      return {
        sessionId,
        output: `Session "${sessionId}" exited during initialization (code ${session.exitCode}).`,
        exitCode: session.exitCode,
        sessionExited: true,
        timedOut: false,
      };
    }

    const commandId = randomUUID().slice(0, 12);

    // If there's already an in-flight command, resolve it early so it
    // doesn't get orphaned when we overwrite the sessionCommandMap entry.
    const existingCommandId = this.sessionCommandMap.get(sessionId);
    if (existingCommandId && this.pendingCommands.has(existingCommandId)) {
      this.resolveCommandWithTimeout(existingCommandId);
    }

    return new Promise<SessionCommandResult>((resolve) => {
      const pending: PendingCommand = {
        resolve,
        sessionId,
        commandId,
        outputLines: [],
        collectedBytes: 0,
        truncatedEarly: false,
        timeoutHandle: null,
        abortHandler: null,
        waitUntil: request.waitUntil,
        rawOutput: '',
      };

      this.pendingCommands.set(commandId, pending);
      this.sessionCommandMap.set(sessionId, commandId);

      // Timeout handling
      // If the model explicitly provided waitUntil, honour its timeoutMs (or the full default).
      // If waitUntil was omitted entirely, use the shorter 20s default so dumb models
      // that forget the param don't leave the tool hanging for 2 minutes.
      const timeoutMs = request.waitUntil
        ? (request.waitUntil.timeoutMs ?? DEFAULT_TIMEOUT_MS)
        : DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS;
      pending.timeoutHandle = setTimeout(() => {
        this.resolveCommandWithTimeout(commandId);
      }, timeoutMs);

      // Abort signal handling
      if (request.abortSignal) {
        if (request.abortSignal.aborted) {
          this.resolveCommandWithTimeout(commandId);
          return;
        }
        const onAbort = () => {
          this.resolveCommandWithTimeout(commandId);
        };
        request.abortSignal.addEventListener('abort', onAbort, { once: true });
        pending.abortHandler = () => {
          request.abortSignal?.removeEventListener('abort', onAbort);
        };
      }

      // If waiting for exit, wire up the exit handler
      if (request.waitUntil?.exited) {
        // The exit handler is already wired via handleSessionExit
        // which will resolve any pending commands when the session exits.
      }

      // Write the command to the PTY
      const command = request.command;
      if (session.shellIntegrationActive) {
        // Shell integration handles boundaries via OSC 133
        session.pty.write(`${command}\r`);
      } else if (session.parser.currentMode === 'sentinel') {
        // Wrap with sentinel for exit code detection
        session.pty.write(
          wrapWithSentinel(
            commandId,
            command,
            this.shell.type === 'powershell',
          ),
        );
      } else {
        // Still in detecting mode — write normally, might get OSC or sentinel
        session.pty.write(`${command}\r`);
      }

      session.lastActivityAt = Date.now();
      this.resetIdleTimer(sessionId);
    });
  }

  // ─── Session management ──────────────────────────────────────

  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Resolve any pending commands
    this.resolveAllPendingForSession(sessionId, 'Session killed.');

    this.cleanupSession(session);
    return true;
  }

  destroyAgent(agentInstanceId: string): void {
    const sessionIds = [...this.sessions.entries()]
      .filter(([, s]) => s.agentInstanceId === agentInstanceId)
      .map(([id]) => id);

    for (const id of sessionIds) {
      this.killSession(id);
    }
  }

  killAll(): void {
    for (const [id] of this.sessions) {
      this.killSession(id);
    }
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionsForAgent(agentInstanceId: string): PtySession[] {
    return [...this.sessions.values()].filter(
      (s) => s.agentInstanceId === agentInstanceId,
    );
  }

  /**
   * Re-target the streaming data callback for an existing session.
   * Used when a session is reused across tool calls so output routes
   * to the correct (current) tool call's buffer.
   */
  setOnData(
    sessionId: string,
    callback: ((sessionId: string, data: string) => void) | null,
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.onData = callback;
    }
  }

  // ─── Private: command resolution ─────────────────────────────

  private resolveCurrentCommand(
    sessionId: string,
    output: string,
    exitCode: number | null,
  ): void {
    const commandId = this.sessionCommandMap.get(sessionId);
    if (!commandId) return;

    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    // Use OSC-provided output, but also include any accumulated lines
    // for the case where output events fired before commandDone.
    const finalOutput =
      output.length > 0 ? stripAnsi(output) : this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(sessionId);

    const session = this.sessions.get(sessionId);
    pending.resolve({
      sessionId,
      output: finalOutput,
      exitCode,
      sessionExited: session?.exited ?? true,
      timedOut: false,
    });
  }

  private resolveCommand(commandId: string, exitCode: number | null): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(pending.sessionId);

    const session = this.sessions.get(pending.sessionId);
    pending.resolve({
      sessionId: pending.sessionId,
      output: finalOutput,
      exitCode,
      sessionExited: session?.exited ?? true,
      timedOut: false,
    });
  }

  private resolveCommandWithTimeout(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(pending.sessionId);

    const session = this.sessions.get(pending.sessionId);
    pending.resolve({
      sessionId: pending.sessionId,
      output: finalOutput,
      exitCode: null,
      sessionExited: session?.exited ?? true,
      timedOut: true,
    });
  }

  private resolveAllPendingForSession(sessionId: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    for (const [commandId, pending] of this.pendingCommands) {
      if (pending.sessionId === sessionId) {
        this.cleanupPending(commandId);
        pending.resolve({
          sessionId,
          output: this.collectOutput(pending) || reason,
          exitCode: session?.exitCode ?? null,
          sessionExited: true,
          timedOut: false,
        });
      }
    }
    this.sessionCommandMap.delete(sessionId);
  }

  private collectOutput(pending: PendingCommand): string {
    if (pending.outputLines.length === 0) return '';
    const capped = applyHeadTailCap(pending.outputLines);
    let cleaned = stripAnsi(capped);
    // Strip sentinel artifacts that appear in sentinel-mode output.
    // These are no-ops when shell integration (OSC 133) is active.
    // 1. Echoed eval wrapper line (contains the %d printf specifier)
    cleaned = cleaned.replace(/^[^\n]*__STAGE_DONE_[^\n]*%d[^\n]*\n?/, '');
    // 2. Resolved sentinel marker line
    cleaned = cleaned.replace(/__STAGE_DONE_[a-zA-Z0-9_-]+_-?\d+__\n?/g, '');
    return cleaned.trimEnd();
  }

  private cleanupPending(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
    pending.abortHandler?.();
    this.pendingCommands.delete(commandId);
  }

  // ─── Private: output accumulation ────────────────────────────

  private appendToCommandOutput(sessionId: string, data: string): void {
    const commandId = this.sessionCommandMap.get(sessionId);
    if (!commandId) return;

    const pending = this.pendingCommands.get(commandId);
    if (!pending || pending.truncatedEarly) return;

    const byteLen = Buffer.byteLength(data, 'utf-8');
    pending.collectedBytes += byteLen;

    if (pending.collectedBytes > MAX_COLLECT_BYTES) {
      pending.truncatedEarly = true;
      pending.outputLines.push(
        '[output truncated: exceeded 5MB collection limit]',
      );
      return;
    }

    const lines = data.split(/\r?\n/);
    pending.outputLines.push(...lines);
    pending.rawOutput += data;

    // Check output pattern if configured
    if (pending.waitUntil?.outputPattern) {
      try {
        const re = new RegExp(pending.waitUntil.outputPattern);
        if (re.test(pending.rawOutput)) {
          this.resolveCommand(pending.commandId, null);
        }
      } catch {
        // Invalid regex — ignore
      }
    }
  }

  // ─── Private: session lifecycle ──────────────────────────────

  private handleSessionExit(sessionId: string, exitCode: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.exited = true;
    session.exitCode = exitCode;

    // Unblock anyone waiting on readyPromise (e.g. shell crashed during detection)
    this.markReady(session);

    // Clear detection timer — no longer needed
    if (session.detectTimerHandle) {
      clearTimeout(session.detectTimerHandle);
      session.detectTimerHandle = null;
    }

    // Resolve any pending commands
    this.resolveAllPendingForSession(
      sessionId,
      `Shell exited with code ${exitCode}.`,
    );

    // Clear idle timer
    if (session.idleTimerHandle) {
      clearTimeout(session.idleTimerHandle);
      session.idleTimerHandle = null;
    }

    // Start grace timer — remove session after grace period
    session.graceTimerHandle = setTimeout(() => {
      this.cleanupSession(session);
    }, SESSION_EXIT_GRACE_MS);
  }

  private cleanupSession(session: PtySession): void {
    if (session.idleTimerHandle) {
      clearTimeout(session.idleTimerHandle);
      session.idleTimerHandle = null;
    }
    if (session.graceTimerHandle) {
      clearTimeout(session.graceTimerHandle);
      session.graceTimerHandle = null;
    }
    if (session.detectTimerHandle) {
      clearTimeout(session.detectTimerHandle);
      session.detectTimerHandle = null;
    }

    if (!session.exited) {
      try {
        session.pty.kill();
      } catch {
        // Already dead
      }
    }

    session.logger?.close();
    session.parser.reset();
    this.sessions.delete(session.id);
    this.sessionCommandMap.delete(session.id);
  }

  private resetIdleTimer(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.exited) return;

    if (session.idleTimerHandle) {
      clearTimeout(session.idleTimerHandle);
    }

    session.idleTimerHandle = setTimeout(() => {
      if (!session.exited) {
        this.killSession(sessionId);
      }
    }, SESSION_IDLE_TIMEOUT_MS);
  }

  private sourceShellIntegration(session: PtySession): void {
    let script: string | null = null;

    switch (this.shell.type) {
      case 'bash':
        script = BASH_INTEGRATION;
        break;
      case 'zsh':
        script = ZSH_INTEGRATION;
        break;
      case 'sh':
        // sh doesn't support the required hooks — use sentinel mode
        session.parser.setMode('sentinel');
        this.markReady(session);
        if (session.detectTimerHandle) {
          clearTimeout(session.detectTimerHandle);
          session.detectTimerHandle = null;
        }
        return;
      case 'powershell':
        // Integration injected via launch args — let the detection timer
        // handle the transition (OSC 133 if detected, sentinel fallback otherwise)
        return;
    }

    if (script) {
      // Source via eval to avoid temp-file creation.
      // Use printf to write the script, then eval it.
      session.pty.write(`eval $'${escapeForShell(script)}'\r`);
    }
  }

  private markReady(session: PtySession): void {
    if (!session.ready) {
      session.ready = true;
      session.readyResolve();
    }
  }

  private getSpawnArgs(): string[] {
    if (this.shell.type === 'powershell') {
      return ['-NoExit', '-Command', POWERSHELL_INTEGRATION];
    }
    return [];
  }

  private getSessionCountForAgent(agentInstanceId: string): number {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.agentInstanceId === agentInstanceId && !session.exited)
        count++;
    }
    return count;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Escape a multi-line string for safe insertion inside double quotes
 * in a shell eval context.
 */
function escapeForShell(s: string): string {
  // Escape for ANSI-C quoting ($'...'): backslashes and single quotes
  // must be escaped; \n becomes a real newline inside $'...'.
  // Dollar signs and backticks are literal in $'...' — no escaping needed.
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}
