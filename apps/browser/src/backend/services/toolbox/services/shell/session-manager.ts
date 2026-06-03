import * as pty from 'node-pty';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { OscParser, wrapWithSentinel } from './osc-parser';
import { SessionLogger } from './session-logger';
import {
  DEFAULT_WAIT_UNTIL_TIMEOUT_MS,
  DEFAULT_EXITED_WAIT_UNTIL_TIMEOUT_MS,
  DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS,
  DEFAULT_TIMEOUT_STDIN_MS,
  HEAD_LINES,
  MAX_SESSIONS_PER_AGENT,
  SHELL_INTEGRATION_DETECT_MS,
  STREAMING_MAX_ROWS,
  TAIL_LINES,
  DEFAULT_TERMINAL_COLS,
  DEFAULT_TERMINAL_ROWS,
  DEFAULT_IDLE_MS,
  DEFAULT_EXITED_IDLE_MS,
  MAX_WAIT_UNTIL_TIMEOUT_MS,
  MAX_EXITED_WAIT_UNTIL_TIMEOUT_MS,
  SHELL_RESPONSE_TAIL_MAX_CHARS,
  type DetectedShell,
  type PtySession,
  type SessionCommandRequest,
  type SessionCommandResult,
} from './types';

/** Cap for rawOutput accumulator used only for pattern matching. */
const MAX_RAW_OUTPUT_BYTES = 1_024 * 1_024;

// ─── Command timeout/idle policy ────────────────────────────────
// Exported so tests can exercise the selection logic as pure helpers.
// Kept here (not inlined in `executeCommand`) so the policy is easy to
// audit and to keep parity with the agent-facing schema describe text.

export function getCommandIdleMs(request: SessionCommandRequest): number {
  if (request.waitUntil?.idleMs !== undefined) return request.waitUntil.idleMs;
  if (request.waitUntil?.exited) return DEFAULT_EXITED_IDLE_MS;
  return DEFAULT_IDLE_MS;
}

export function getCommandTimeoutMs(request: SessionCommandRequest): number {
  if (!request.waitUntil) {
    return request.rawInput
      ? DEFAULT_TIMEOUT_STDIN_MS
      : DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS;
  }

  if (request.waitUntil.exited) {
    return Math.min(
      request.waitUntil.timeoutMs ?? DEFAULT_EXITED_WAIT_UNTIL_TIMEOUT_MS,
      MAX_EXITED_WAIT_UNTIL_TIMEOUT_MS,
    );
  }

  return Math.min(
    request.waitUntil.timeoutMs ?? DEFAULT_WAIT_UNTIL_TIMEOUT_MS,
    MAX_WAIT_UNTIL_TIMEOUT_MS,
  );
}

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

function getProcessCwd(pid: number): string | null {
  try {
    if (process.platform === 'linux') {
      return fs.readlinkSync(`/proc/${pid}/cwd`);
    }

    if (process.platform === 'darwin') {
      const output = execFileSync(
        'lsof',
        ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 250,
        },
      );
      const cwdLine = output.split('\n').find((line) => line.startsWith('n'));
      return cwdLine ? cwdLine.slice(1) : null;
    }
  } catch {
    return null;
  }

  return null;
}

function realpathOrNull(cwd: string): string | null {
  try {
    return fs.realpathSync.native(cwd);
  } catch {
    return null;
  }
}

function areSameShellCwd(a: string, b: string): boolean {
  if (path.resolve(a) === path.resolve(b)) return true;
  const realA = realpathOrNull(a);
  const realB = realpathOrNull(b);
  return realA != null && realB != null && realA === realB;
}

export function injectBoundaryToken(
  script: string,
  boundaryToken: string | undefined,
): string {
  return script.replaceAll('__STAGEWISE_BOUNDARY_TOKEN__', boundaryToken ?? '');
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

export const BASH_INTEGRATION = `
if [ -n "$__STAGEWISE_SHELL_INTEGRATION" ]; then return 0 2>/dev/null || true; fi
# Plain (non-exported) guard: prevents re-sourcing within THIS shell only.
# Exporting it would leak into child shells, tripping their own guard before
# they register OSC 133 hooks and forcing them into sentinel mode.
__STAGEWISE_SHELL_INTEGRATION=1
{ unset HISTFILE; } 2>/dev/null
HISTSIZE=0 2>/dev/null
HISTFILESIZE=0 2>/dev/null
set +o history 2>/dev/null
__stagewise_command_executed=0
__stagewise_boundary_token="__STAGEWISE_BOUNDARY_TOKEN__"
__stagewise_file_uri_path() {
  local path="$1"
  local encoded=''
  local i ch hex
  local LC_ALL=C
  for (( i = 0; i < \${#path}; i++ )); do
    ch="\${path:i:1}"
    case "$ch" in
      [A-Za-z0-9._~/-]) encoded+="$ch" ;;
      *) hex=$(printf '%%%02X' "'$ch"); encoded+="$hex" ;;
    esac
  done
  printf '%s' "$encoded"
}
__stagewise_emit_cwd() {
  printf '\\033]7;file://%s%s\\007' "\${HOSTNAME:-localhost}" "$(__stagewise_file_uri_path "$PWD")"
}
__stagewise_prompt_command() {
  local exit_code=$?
  if [ "$__stagewise_command_executed" = "1" ]; then
    printf '\\033]133;D;%d;%s\\007' "$exit_code" "$__stagewise_boundary_token"
    __stagewise_command_executed=0
  fi
  __stagewise_emit_cwd
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
__stagewise_emit_cwd
printf '\\033]133;A\\007'
`.trim();

export const ZSH_INTEGRATION = `
if [[ -n "$__STAGEWISE_SHELL_INTEGRATION" ]]; then return 0 2>/dev/null || true; fi
# Plain (non-exported) guard: prevents re-sourcing within THIS shell only.
# Exporting it would leak into child shells, tripping their own guard before
# they register OSC 133 hooks and forcing them into sentinel mode.
__STAGEWISE_SHELL_INTEGRATION=1
{ unset HISTFILE; } 2>/dev/null
HISTSIZE=0 2>/dev/null
SAVEHIST=0 2>/dev/null
unsetopt SHARE_HISTORY INC_APPEND_HISTORY APPEND_HISTORY 2>/dev/null
PROMPT_EOL_MARK=''
__stagewise_command_executed=0
__stagewise_boundary_token="__STAGEWISE_BOUNDARY_TOKEN__"
__stagewise_file_uri_path() {
  local p="$1"
  local encoded=''
  local i ch hex
  local LC_ALL=C
  for (( i = 0; i < \${#p}; i++ )); do
    ch="\${p:$i:1}"
    case "$ch" in
      [A-Za-z0-9._~/-]) encoded+="$ch" ;;
      *) hex=$(printf '%%%02X' "'$ch"); encoded+="$hex" ;;
    esac
  done
  printf '%s' "$encoded"
}
__stagewise_emit_cwd() {
  printf '\\033]7;file://%s%s\\007' "\${HOST:-\${HOSTNAME:-localhost}}" "$(__stagewise_file_uri_path "$PWD")"
}
autoload -Uz add-zsh-hook 2>/dev/null
__stagewise_precmd() {
  local exit_code=$?
  if [[ "$__stagewise_command_executed" == "1" ]]; then
    printf '\\033]133;D;%d;%s\\007' "$exit_code" "$__stagewise_boundary_token"
    __stagewise_command_executed=0
  fi
  __stagewise_emit_cwd
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
__stagewise_emit_cwd
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
  BoundaryToken  = "__STAGEWISE_BOUNDARY_TOKEN__"
}
function Global:Prompt() {
  $FakeCode = [int]!$global:?
  Set-StrictMode -Off
  $LastHistoryEntry = Get-History -Count 1
  $Result = ""
  if ($Global:__StagewiseState.LastHistoryId -ne -1 -and ($Global:__StagewiseState.HasPSReadLine -eq $false -or $Global:__StagewiseState.IsInExecution -eq $true)) {
    $Global:__StagewiseState.IsInExecution = $false
    if ($LastHistoryEntry.Id -eq $Global:__StagewiseState.LastHistoryId) {
      $Result += "$([char]0x1b)]133;D;0;$($Global:__StagewiseState.BoundaryToken)\`a"
    } else {
      $Result += "$([char]0x1b)]133;D;$FakeCode;$($Global:__StagewiseState.BoundaryToken)\`a"
    }
  }
  $Cwd = (Get-Location).ProviderPath.Replace('\\', '/')
  if ($Cwd -match '^[A-Za-z]:/') { $Cwd = "/$Cwd" }
  $Result += "$([char]0x1b)]7;file://localhost$Cwd\`a"
  $Result += "$([char]0x1b)]133;A\`a"
  if ($FakeCode -ne 0) { Write-Error "failure" -ea ignore }
  $Result += $Global:__StagewiseState.OriginalPrompt.Invoke()
  $Result += "$([char]0x1b)]133;B\`a"
  $Global:__StagewiseState.LastHistoryId = $LastHistoryEntry.Id
  return $Result
}
$Global:__StagewiseState.HasPSReadLine = $false
if (Get-Module -Name PSReadLine) {
  Set-PSReadLineOption -HistorySaveStyle SaveNothing
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
  /** Absolute buffer line at command start (baseY + cursorY). */
  markLine: number;
  timeoutHandle: NodeJS.Timeout | null;
  abortHandler: (() => void) | null;
  waitUntil?: SessionCommandRequest['waitUntil'];
  /** Accumulated raw output for pattern matching (capped at 1 MB). */
  rawOutput: string;
  rawOutputCapped: boolean;
  /** Serialized buffer text captured at the moment of a buffer-based pattern match. */
  bufferSnapshot?: string;
  /** Sanitized regex match captured from raw output when buffer matching fails. */
  rawPatternSnapshot?: string;
  /** Whether the first command-output start marker has already set markLine. */
  hasCommandStart: boolean;
  /** Idle-detection state (see `DEFAULT_IDLE_MS`). */
  idleTimerHandle: NodeJS.Timeout | null;
  /** Silence threshold in ms (0 disables idle detection for this command). */
  idleMs: number;
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
  /**
   * Optional observer called whenever a session's state changes
   * (created, exited, killed). Receives the agentInstanceId affected.
   */
  onSessionStateChange: ((agentInstanceId: string) => void) | null = null;

  /**
   * Grace period (ms) to wait for OSC 133 integration detection before
   * falling back to sentinel mode. Exposed as an override primarily so
   * tests can shorten the window (default 5s is excessive when the test
   * shell is known not to emit 133 markers cleanly).
   */
  private readonly detectTimeoutMs: number;

  /**
   * Extra options merged into every `pty.spawn` call. Lets tests force
   * winpty on Windows (`useConpty: false`) to avoid the `AttachConsole`
   * storm from node-pty's `conpty_console_list_agent` helper, which races
   * with fast-exiting test shells and floods logs. Production leaves this
   * empty so ConPTY stays the default.
   */
  private readonly ptySpawnOptions: Partial<
    pty.IPtyForkOptions & pty.IWindowsPtyForkOptions
  >;

  constructor(
    shell: DetectedShell,
    getShellLogsDir?: (agentInstanceId: string) => string,
    detectTimeoutMs: number = SHELL_INTEGRATION_DETECT_MS,
    ptySpawnOptions: Partial<
      pty.IPtyForkOptions & pty.IWindowsPtyForkOptions
    > = {},
  ) {
    this.shell = shell;
    this.getShellLogsDir = getShellLogsDir ?? null;
    this.detectTimeoutMs = detectTimeoutMs;
    this.ptySpawnOptions = ptySpawnOptions;
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

    let sessionId: string | undefined;
    for (let i = 0; i < 10; i++) {
      const candidate = randomUUID().slice(0, 4);
      if (!this.sessions.has(candidate)) {
        sessionId = candidate;
        break;
      }
    }
    if (!sessionId) {
      sessionId = randomUUID();
    }

    const boundaryToken = randomUUID().replace(/-/g, '');
    const spawnArgs = this.getSpawnArgs(boundaryToken);
    const ptyProcess = pty.spawn(this.shell.path, spawnArgs, {
      name: 'xterm-256color',
      cols: DEFAULT_TERMINAL_COLS,
      rows: DEFAULT_TERMINAL_ROWS,
      cwd,
      env: { ...env, TERM: 'xterm-256color' },
      ...this.ptySpawnOptions,
    });

    const parser = new OscParser(boundaryToken, (cwdCandidate) => {
      const processCwd = getProcessCwd(ptyProcess.pid);
      if (processCwd == null) return 'unknown';
      return areSameShellCwd(path.resolve(cwdCandidate), processCwd)
        ? 'trusted'
        : 'untrusted';
    });

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
      deactivated: false,
      detectTimerHandle: null,
      ready: false,
      readyPromise: null!,
      readyResolve: null!,
      onData: onData ?? null,
      cwd,
      currentCwd: cwd,
      logger: this.getShellLogsDir
        ? new SessionLogger(
            path.join(
              this.getShellLogsDir(agentInstanceId),
              `${sessionId}.shell.log`,
            ),
          )
        : null,
      initScriptPath: null,
    };

    // Wire ready promise
    session.readyPromise = new Promise<void>((resolve) => {
      session.readyResolve = resolve;
    });

    this.sessions.set(sessionId, session);
    this.onSessionStateChange?.(agentInstanceId);

    // Wire PTY data → parser
    // Terminal rendering is NOT done here. We only store raw bytes (for
    // replay) and append to the on-disk log. The headless xterm is rendered
    // incrementally from the parser's `output` event (see below) so the
    // cursor is correctly positioned at each OSC marker. Rendering the whole
    // chunk up-front advanced the cursor past the command output before
    // `commandStart` fired, corrupting the captured mark line whenever a fast
    // command's echo + output + done markers arrived in a single PTY chunk.
    ptyProcess.onData((data: string) => {
      session.logger?.storeRawChunk(Buffer.from(data, 'utf-8'));
      session.logger?.append(stripAnsi(data));
      parser.write(data);
    });

    // Wire PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.handleSessionExit(sessionId, exitCode);
    });

    // Trust model for cwd tracking:
    // - `session.cwd` is the single source of truth used by UI and smart
    //   approval.
    // - It represents the parent shell process cwd, not cwd-like bytes printed
    //   by child commands.
    // - OscParser strips and ignores OSC 7 from command output, and only trusts
    //   OSC 133 command-end markers containing this session's boundary token.
    //   That token is a guardrail, not the trust root: shell state is still
    //   same-user command-controlled, so a cwd update is accepted only when it
    //   matches the OS-reported cwd of the parent shell process. If the OS cwd
    //   cannot be read, keep the last trusted cwd rather than trusting PTY bytes.
    //   This keeps real `cd` behavior where validation is available while
    //   preventing forged prompt metadata from moving smart approval into a
    //   command-controlled directory.
    parser.on('cwd', (cwd) => {
      const normalizedCwd = path.resolve(cwd);
      if (normalizedCwd === session.cwd) return;

      const processCwd = getProcessCwd(session.pty.pid);
      if (!processCwd || !areSameShellCwd(normalizedCwd, processCwd)) {
        return;
      }

      session.cwd = normalizedCwd;
      session.currentCwd = normalizedCwd;
      session.lastActivityAt = Date.now();
      this.onSessionStateChange?.(agentInstanceId);
    });

    parser.on('integrationDetected', () => {
      // The bash/zsh integration scripts guard `133;D` emission on
      // `__stagewise_command_executed`, which is 0 at init, so no
      // "sourcing D" ever arrives. Integration detection means the shell
      // is at its first prompt — ready to accept user commands.
      session.shellIntegrationActive = true;
      this.markReady(session);
      if (session.detectTimerHandle) {
        clearTimeout(session.detectTimerHandle);
        session.detectTimerHandle = null;
      }
    });

    parser.on('commandDone', (event) => {
      this.resolveCurrentCommand(sessionId, event.exitCode);
    });

    // FIX: When OSC 133;C fires, the prompt + command echo are already in
    // the xterm buffer and the cursor is on the row right before the
    // command's first output line. Moving the markLine here ensures
    // serializeFrom() returns only the command output (no prompt echo).
    parser.on('commandStart', () => {
      if (!session.ready) return;
      const cid = this.sessionCommandMap.get(sessionId);
      if (!cid) return;
      const pending = this.pendingCommands.get(cid);
      if (!pending || pending.hasCommandStart) return;
      const newMark = session.logger?.getMarkPosition();
      if (newMark !== undefined) {
        pending.markLine = newMark;
        pending.hasCommandStart = true;
      }
    });

    parser.on('sentinelDone', (id, exitCode) => {
      const pending = this.pendingCommands.get(id);
      if (pending) {
        // Sentinel is the fallback equivalent of OSC 133;D — a real
        // command exit, not a pattern match.
        this.resolveCommand(id, exitCode, 'exit');
      }
    });

    parser.on('output', (data) => {
      // Render incrementally FIRST so the headless terminal's cursor reflects
      // exactly the bytes up to the current parser position. This keeps the
      // command mark (captured at OSC 133;C in the commandStart handler) and
      // serializeFrom() accurate even when a fast command's echo, output, and
      // 133;D done marker all arrive in a single PTY chunk. It must run before
      // appendToCommandOutput, whose pattern matching reads the buffer.
      session.logger?.renderToTerminal(data);

      // Stream to UI only when inside a real command's output region.
      // In OSC mode, this is between 133;C and 133;D. In sentinel mode,
      // all output is user-command output (prompt/echo aren't framed
      // but there's nothing else we can do). In detecting mode, suppress.
      if (
        session.ready &&
        (parser.inCommandOutput || parser.currentMode === 'sentinel')
      ) {
        session.onData?.(sessionId, data);
      }
      this.appendToCommandOutput(sessionId, data);
    });

    // Start shell integration detection timer
    session.detectTimerHandle = setTimeout(() => {
      session.detectTimerHandle = null;
      if (!session.shellIntegrationActive) {
        parser.setMode('sentinel');
      }
      this.markReady(session);
    }, this.detectTimeoutMs);

    // Source shell integration script
    this.sourceShellIntegration(session);

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
        resolvedBy: 'session_exited',
      };
    }

    if (session.exited) {
      return {
        sessionId,
        output: `Session "${sessionId}" has already exited (code ${session.exitCode}).`,
        exitCode: session.exitCode,
        sessionExited: true,
        timedOut: false,
        resolvedBy: 'session_exited',
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
        resolvedBy: 'session_exited',
      };
    }

    const commandId = randomUUID().slice(0, 12);

    // If there's already an in-flight command, abandon it so it doesn't
    // get orphaned when we overwrite the sessionCommandMap entry. From the
    // abandoned command's perspective this counts as an abort — the new
    // tool call is replacing it, not a time cap elapsing.
    const existingCommandId = this.sessionCommandMap.get(sessionId);
    if (existingCommandId && this.pendingCommands.has(existingCommandId)) {
      this.resolveCommandWithTimeout(existingCommandId, 'abort');
    }

    return new Promise<SessionCommandResult>((resolve) => {
      const mark = session.logger?.getMarkPosition() ?? 0;
      const idleMs = getCommandIdleMs(request);
      const pending: PendingCommand = {
        resolve,
        sessionId,
        commandId,
        markLine: mark,
        timeoutHandle: null,
        abortHandler: null,
        waitUntil: request.waitUntil,
        rawOutput: '',
        rawOutputCapped: false,
        hasCommandStart: false,
        idleTimerHandle: null,
        idleMs,
      };

      this.pendingCommands.set(commandId, pending);
      this.sessionCommandMap.set(sessionId, commandId);

      // Timeout handling
      // Self-terminating commands (`exited: true`) get a longer ceiling;
      // other shell calls keep the short snapshot cap so interactive hangs
      // return quickly for follow-up/polling.
      const timeoutMs = getCommandTimeoutMs(request);
      pending.timeoutHandle = setTimeout(() => {
        this.resolveCommandWithTimeout(commandId, 'timeout');
      }, timeoutMs);

      // Abort signal handling
      if (request.abortSignal) {
        if (request.abortSignal.aborted) {
          this.resolveCommandWithTimeout(commandId, 'abort');
          return;
        }
        const onAbort = () => {
          this.resolveCommandWithTimeout(commandId, 'abort');
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

      const command = request.command;

      if (request.rawInput) {
        // Raw stdin: write bytes verbatim — no \r, no sentinel
        session.pty.write(command);
      } else if (command.length === 0) {
        // Empty command, no rawInput — don't write anything to the PTY.
        // The agent is just waiting for output; the pending command will
        // resolve via timeout, pattern match, or session exit.
      } else if (session.shellIntegrationActive) {
        // Shell integration handles output boundaries via OSC 133 and emits
        // OSC 7 cwd metadata at prompt time for session cwd tracking.
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
    });
  }

  // ─── Live snapshot (UI streaming) ───────────────────────────────

  /**
   * Returns the currently-rendered grid text for the in-flight command on
   * the given session, from the command's mark line through the current
   * cursor. Used by the UI streaming path to ship fully-rendered output
   * (spinners, redraws, progress bars applied) instead of raw PTY bytes.
   *
   * Returns `null` when there is no pending command on the session, the
   * session is unknown, or the logger is unavailable. In those cases the
   * caller should clear any stale streaming state for the tool call.
   *
   * When a TUI is active (alternate buffer — vim, less, htop), the
   * alternate-buffer viewport is serialized instead of the normal buffer.
   */
  getLiveOutputSnapshot(sessionId: string): string | null {
    const commandId = this.sessionCommandMap.get(sessionId);
    if (!commandId) return null;
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return null;
    const session = this.sessions.get(sessionId);
    const logger = session?.logger;
    if (!logger) return null;
    const lines = logger.isAlternateBufferActive()
      ? logger.serializeAlternate()
      : logger.serializeTailFrom(pending.markLine, STREAMING_MAX_ROWS);
    return lines.join('\n');
  }

  // ─── Session management ──────────────────────────────────────

  killSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const { agentInstanceId } = session;

    // Resolve any pending commands. A user/agent-initiated kill is
    // semantically an abort, not a natural session exit.
    this.resolveAllPendingForSession(sessionId, 'Session killed.', 'abort');

    // Kill the PTY process before marking exited (deactivateSession skips kill when exited=true)
    try {
      session.pty.kill();
    } catch {
      // Already dead
    }

    // Mark as exited before deactivation so Karton sees the final state
    session.exited = true;
    session.exitCode ??= null;
    this.deactivateSession(session);
    this.onSessionStateChange?.(agentInstanceId);
    return true;
  }

  destroyAgent(agentInstanceId: string): void {
    const sessions = [...this.sessions.values()].filter(
      (s) => s.agentInstanceId === agentInstanceId,
    );
    for (const s of sessions) {
      this.resolveAllPendingForSession(s.id, 'Agent destroyed.', 'abort');
      this.removeSession(s);
    }
  }

  killAll(): void {
    for (const session of [...this.sessions.values()]) {
      this.resolveAllPendingForSession(
        session.id,
        'All sessions killed.',
        'abort',
      );
      this.removeSession(session);
    }
  }

  resizeSession(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.deactivated) return false;
    session.pty.resize(cols, rows);
    session.logger?.resize(cols, rows);
    return true;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  getCurrentCwd(sessionId: string): string | undefined {
    return this.getSessionCwd(sessionId);
  }

  getSessionCwd(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.cwd;
  }

  /**
   * Total number of sessions currently tracked (alive + exited-but-not-removed).
   * Used by ShellService teardown logging to correlate crash reports with
   * whether the PTY-kill path actually ran on shutdown.
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Returns the tail of the session's captured output for use as context in
   * downstream classifiers (e.g. smart approval). Internally delegates to
   * `collectRecentOutput`; kept as a separate public method so the private
   * helper is not exposed more broadly than needed.
   */
  public getRecentOutput(sessionId: string): string | undefined {
    return this.collectRecentOutput(sessionId);
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
    exitCode: number | null,
  ): void {
    const commandId = this.sessionCommandMap.get(sessionId);
    if (!commandId) {
      return;
    }

    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(sessionId);

    const session = this.sessions.get(sessionId);
    pending.resolve({
      sessionId,
      output: finalOutput,
      recentOutput: this.collectRecentOutput(sessionId),
      exitCode,
      sessionExited: session?.exited ?? true,
      timedOut: false,
      resolvedBy: 'exit',
    });
  }

  private resolveCommand(
    commandId: string,
    exitCode: number | null,
    reason: 'pattern' | 'exit' = 'pattern',
  ): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(pending.sessionId);

    const session = this.sessions.get(pending.sessionId);
    pending.resolve({
      sessionId: pending.sessionId,
      output: finalOutput,
      recentOutput: this.collectRecentOutput(pending.sessionId),
      exitCode,
      sessionExited: session?.exited ?? true,
      timedOut: false,
      resolvedBy: reason,
    });
  }

  private resolveCommandWithTimeout(
    commandId: string,
    reason: 'timeout' | 'abort',
  ): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(pending.sessionId);

    const session = this.sessions.get(pending.sessionId);
    pending.resolve({
      sessionId: pending.sessionId,
      output: finalOutput,
      recentOutput: this.collectRecentOutput(pending.sessionId),
      exitCode: null,
      sessionExited: session?.exited ?? true,
      timedOut: reason === 'timeout',
      resolvedBy: reason,
    });
  }

  private resolveCommandIdle(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const finalOutput = this.collectOutput(pending);

    this.cleanupPending(commandId);
    this.sessionCommandMap.delete(pending.sessionId);

    const session = this.sessions.get(pending.sessionId);
    pending.resolve({
      sessionId: pending.sessionId,
      output: finalOutput,
      recentOutput: this.collectRecentOutput(pending.sessionId),
      exitCode: null,
      sessionExited: session?.exited ?? true,
      timedOut: false,
      resolvedBy: 'idle',
    });
  }

  private resolveAllPendingForSession(
    sessionId: string,
    reason: string,
    resolvedBy: 'session_exited' | 'abort' = 'session_exited',
  ): void {
    const session = this.sessions.get(sessionId);
    for (const [commandId, pending] of this.pendingCommands) {
      if (pending.sessionId === sessionId) {
        this.cleanupPending(commandId);
        pending.resolve({
          sessionId,
          output: this.collectOutput(pending) || reason,
          recentOutput: this.collectRecentOutput(sessionId),
          exitCode: session?.exitCode ?? null,
          sessionExited: true,
          timedOut: false,
          resolvedBy,
        });
      }
    }
    this.sessionCommandMap.delete(sessionId);
  }

  private collectRecentOutput(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    return session?.logger?.getTail(SHELL_RESPONSE_TAIL_MAX_CHARS) ?? '';
  }

  private collectOutput(pending: PendingCommand): string {
    const rawOutput = stripAnsi(pending.rawOutput).trimEnd();

    // If a buffer snapshot was captured at pattern-match time, return it
    // directly. This avoids a second serialization that may produce a
    // different range if the cursor moved since the match.
    if (pending.bufferSnapshot != null) {
      const snapLines = pending.bufferSnapshot.split('\n');
      return applyHeadTailCap(snapLines).trimEnd();
    }

    // If logger matching failed but sanitized raw command output matched the
    // requested pattern, return only the matched visible text. Do not fall back
    // to the full raw stream for logger-backed sessions: it can include text
    // that the terminal later cleared or redrew away.
    if (pending.rawPatternSnapshot != null) {
      return pending.rawPatternSnapshot;
    }

    const session = this.sessions.get(pending.sessionId);
    if (!session?.logger) return rawOutput;

    const logger = session.logger;
    const isAlt = logger.isAlternateBufferActive();
    const lines = isAlt
      ? logger.serializeAlternate()
      : logger.serializeFrom(pending.markLine);

    if (lines.length === 0) return '';
    return applyHeadTailCap(lines).trimEnd();
  }

  private cleanupPending(commandId: string): void {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    if (pending.timeoutHandle) {
      clearTimeout(pending.timeoutHandle);
    }
    if (pending.idleTimerHandle) {
      clearTimeout(pending.idleTimerHandle);
    }
    pending.abortHandler?.();
    this.pendingCommands.delete(commandId);
  }

  // ─── Private: output accumulation ────────────────────────────

  private appendToCommandOutput(sessionId: string, data: string): void {
    const commandId = this.sessionCommandMap.get(sessionId);
    if (!commandId) return;

    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const session = this.sessions.get(sessionId);

    // Accumulate raw output exclusively while inside real command output.
    // This prevents prompt text and the echoed command line from polluting
    // `pending.rawOutput` and triggering spurious matches. The raw stream is
    // used directly when no logger exists and as a fallback when logger-backed
    // xterm serialization is stale or marked from the wrong row.
    const inUserOutput =
      session?.parser.inCommandOutput ||
      session?.parser.currentMode === 'sentinel';

    if (inUserOutput && !pending.rawOutputCapped) {
      pending.rawOutput += data;
      if (Buffer.byteLength(pending.rawOutput, 'utf-8') > MAX_RAW_OUTPUT_BYTES)
        pending.rawOutputCapped = true;
    }

    // Idle detection: only arm after real command output has been emitted.
    //
    // `inUserOutput` is already true only when the parser has either seen
    // OSC 133;C (marks the start of stdout on shells with integration) or
    // is operating in sentinel mode (command body is running). Combined
    // with a non-whitespace check on the data chunk, this is a strict
    // "real output has been emitted" signal that is independent of prompt
    // layout — unlike a grid-row count, it works for multi-line prompts,
    // PowerShell, pasted multi-line commands, and any future prompt
    // framework that renders differently.
    //
    // `idleMs === 0` disables idle detection entirely.
    if (inUserOutput && pending.idleMs > 0 && /\S/.test(data)) {
      if (pending.idleTimerHandle) clearTimeout(pending.idleTimerHandle);
      pending.idleTimerHandle = setTimeout(() => {
        this.resolveCommandIdle(pending.commandId);
      }, pending.idleMs);
    }

    if (pending.waitUntil?.outputPattern) {
      const logger = session?.logger;

      try {
        const re = new RegExp(pending.waitUntil.outputPattern);

        if (logger) {
          // Buffer-based matching: test against visible terminal state.
          // The buffer is already up-to-date: renderToTerminal runs at the
          // top of the parser's `output` handler, before this code (also
          // invoked from that handler via appendToCommandOutput).
          //
          // Skip the first serialized line because it typically contains
          // the prompt and the echoed command itself — matching against
          // it would resolve prematurely for patterns like `create` in
          // `npx create-video@latest`. Command output always starts at
          // line index 1 of the serialized range.
          const lines = logger.serializeFrom(pending.markLine);
          const matchText = lines.slice(1).join('\n');
          if (matchText && re.test(matchText)) {
            pending.bufferSnapshot = lines.join('\n');
            this.resolveCommand(pending.commandId, null);
            return;
          }
        }

        if (inUserOutput && !pending.rawOutputCapped) {
          // Fallback: match against sanitized visible command output. Capture
          // only the matched text so logger-backed results do not expose raw
          // transient output that the terminal later cleared or redrew away.
          const rawMatchText = stripAnsi(pending.rawOutput).trimEnd();
          re.lastIndex = 0;
          const match = re.exec(rawMatchText);
          if (match?.[0]) {
            pending.rawPatternSnapshot = match[0];
            this.resolveCommand(pending.commandId, null);
          }
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
    this.onSessionStateChange?.(session.agentInstanceId);

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

    // Deactivate (close logger, kill PTY) but keep in sessions map for UI visibility
    this.deactivateSession(session);
  }

  private deactivateSession(session: PtySession): void {
    if (session.deactivated) return;
    session.deactivated = true;

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
    this.sessionCommandMap.delete(session.id);

    // Best-effort cleanup of temp init script (may already be removed by the shell)
    if (session.initScriptPath) {
      try {
        fs.unlinkSync(session.initScriptPath);
      } catch {
        // Already removed by the shell's `rm -f`
      }
      session.initScriptPath = null;
    }
  }

  private removeSession(session: PtySession): void {
    this.deactivateSession(session);
    this.sessions.delete(session.id);
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
      // Write to a temp file and dot-source it. This avoids ZLE echoing
      // the entire script char-by-char (which can exceed the detection
      // timeout with rich prompt frameworks like starship/p10k).
      const nativeTempPath = path.join(tmpdir(), `sw-${session.id}.sh`);
      try {
        fs.writeFileSync(
          nativeTempPath,
          injectBoundaryToken(script, session.parser.boundaryToken),
          { mode: 0o600 },
        );
        session.initScriptPath = nativeTempPath;
        // Dot-source is POSIX (cannot be aliased). Cleanup handled by deactivateSession.
        // Single-quote to survive paths containing spaces (e.g. Windows
        // usernames with spaces → `/c/Users/Some Name/...`). Node's
        // `os.tmpdir()` output never contains single quotes, so wrapping is
        // safe without additional escaping.
        const shellPath = toMsysPath(nativeTempPath);
        session.pty.write(`. '${shellPath}'\r`);
      } catch (_err) {
        // Temp file write failed — fall back to eval through the line editor.
        session.pty.write(
          `eval $'${escapeForShell(
            injectBoundaryToken(script, session.parser.boundaryToken),
          )}'\r`,
        );
      }
    }
  }

  private markReady(session: PtySession): void {
    if (!session.ready) {
      session.ready = true;
      session.readyResolve();
    }
  }

  private getSpawnArgs(boundaryToken: string): string[] {
    if (this.shell.type === 'powershell') {
      return [
        '-NoExit',
        '-Command',
        injectBoundaryToken(POWERSHELL_INTEGRATION, boundaryToken),
      ];
    }
    if (process.platform === 'win32' && this.shell.type === 'bash') {
      return ['--login', '-i'];
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

/**
 * Convert a native Windows path to an MSYS/Git Bash compatible path.
 * e.g. `C:\Users\X\AppData\Local\Temp` → `/c/Users/X/AppData/Local/Temp`
 *
 * On non-Windows platforms, returns the path unchanged.
 */
function toMsysPath(nativePath: string): string {
  if (process.platform !== 'win32') return nativePath;
  const match = nativePath.match(/^([A-Za-z]):[/\\](.*)/);
  if (!match) return nativePath;
  const driveLetter = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, '/');
  return `/${driveLetter}/${rest}`;
}
