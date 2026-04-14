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
export const HEAD_LINES = 100;
export const TAIL_LINES = 300;
export const MAX_COLLECT_BYTES = 5 * 1024 * 1024;

// ─── Session types ────────────────────────────────────────────────

/** Maximum concurrent PTY sessions per agent instance. */
export const MAX_SESSIONS_PER_AGENT = 5;

/** Grace period (ms) after PTY exit before the session is removed. */
export const SESSION_EXIT_GRACE_MS = 60_000;

/** Idle timeout (ms) — sessions with no writes are terminated. */
export const SESSION_IDLE_TIMEOUT_MS = 10 * 60_000;

/**
 * Grace period (ms) to wait for OSC 133 shell integration detection
 * before falling back to sentinel mode.
 */
export const SHELL_INTEGRATION_DETECT_MS = 2_000;

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
  idleTimerHandle: NodeJS.Timeout | null;
  graceTimerHandle: NodeJS.Timeout | null;
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
}

export interface SessionCommandRequest {
  command: string;
  cwd?: string;
  sessionId?: string;
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
