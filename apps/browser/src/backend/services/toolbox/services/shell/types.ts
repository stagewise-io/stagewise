import type { IPty } from 'node-pty';
import type { OscParser } from './osc-parser';
import type { SessionLogger } from './session-logger';

// ─── Shell detection types (unchanged) ────────────────────────────

export type ShellType = 'bash' | 'zsh' | 'sh' | 'powershell';

export interface DetectedShell {
  type: ShellType;
  path: string;
}

// ─── Output capping constants (unchanged) ─────────────────────────

export const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Shorter timeout (ms) used when the model omits `waitUntil` entirely.
 * Long enough for ls, git status, pnpm install, most builds —
 * short enough to avoid a 2-minute hang on `pnpm dev`.
 */
export const DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS = 20_000;

/**
 * Shorter timeout (ms) for raw stdin input without explicit `waitUntil`.
 * Interactive prompts respond quickly; 5s avoids long hangs on menu selections.
 */
export const DEFAULT_TIMEOUT_STDIN_MS = 5_000;
export const HEAD_LINES = 100;
export const TAIL_LINES = 300;

// ─── Session types ────────────────────────────────────────────────

/** Maximum concurrent PTY sessions per agent instance. */
export const MAX_SESSIONS_PER_AGENT = 5;

/**
 * Grace period (ms) to wait for OSC 133 shell integration detection
 * before falling back to sentinel mode.
 */
export const SHELL_INTEGRATION_DETECT_MS = 5_000;

/**
 * Terminal grid width (columns) used by the PTY, the headless xterm
 * emulator that captures screen state, and the serialized rows streamed
 * to the UI. 120 fits most modern CLI tool output (tables, progress
 * bars) without hard-wrapping, while being narrow enough to render
 * cleanly inside the chat panel via CSS soft-wrap.
 */
export const DEFAULT_TERMINAL_COLS = 120;

/** Terminal grid height (rows). xterm default; scrollback carries history. */
export const DEFAULT_TERMINAL_ROWS = 24;

/**
 * Maximum number of rows serialized per live-streaming flush. The live
 * UI preview does not need the full command scrollback — only a trailing
 * window. 200 rows is wider than any practical tool-part viewport while
 * bounding per-flush serialization cost to O(200) regardless of how
 * long the command has been running.
 */
export const STREAMING_MAX_ROWS = 200;

export interface PtySession {
  id: string;
  agentInstanceId: string;
  pty: IPty;
  parser: OscParser;
  shellIntegrationActive: boolean;
  createdAt: number;
  lastActivityAt: number;
  exited: boolean;
  exitCode: number | null;
  /** True once the PTY has been killed, logger closed, and timers cleared. Session stays in the map for UI visibility. */
  deactivated: boolean;
  /** Timer for shell integration detection grace period. */
  detectTimerHandle: NodeJS.Timeout | null;
  /** True once the integration script has been consumed and the session is ready for real commands. */
  ready: boolean;
  /** Resolves when the session becomes ready. */
  readyPromise: Promise<void>;
  readyResolve: () => void;
  /** Re-assignable data callback for streaming output to the current tool call. */
  onData: ((sessionId: string, data: string) => void) | null;
  /** Append-only log writer for the session's full output history. */
  logger: SessionLogger | null;
  /** Working directory the session was started in. */
  cwd: string;
  /** Path to the temp init script file, for cleanup. */
  initScriptPath: string | null;
}

export interface SessionCommandRequest {
  command: string;
  cwd?: string;
  sessionId?: string;
  /** When true, write command bytes verbatim — no `\r`, no sentinel wrapping. */
  rawInput?: boolean;
  waitUntil?: {
    timeoutMs?: number;
    exited?: boolean;
    outputPattern?: string;
  };
  abortSignal?: AbortSignal;
}

export interface SessionCommandResult {
  sessionId: string;
  output: string;
  exitCode: number | null;
  sessionExited: boolean;
  timedOut: boolean;
}
