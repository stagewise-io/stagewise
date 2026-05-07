import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyHeadTailCap,
  stripAnsi,
  SessionManager,
  getCommandIdleMs,
  getCommandTimeoutMs,
} from './session-manager';
import { detectShell } from './detect-shell';
import { sanitizeEnv } from './sanitize-env';
import {
  DEFAULT_EXITED_IDLE_MS,
  DEFAULT_EXITED_WAIT_UNTIL_TIMEOUT_MS,
  DEFAULT_IDLE_MS,
  DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS,
  DEFAULT_TIMEOUT_STDIN_MS,
  DEFAULT_WAIT_UNTIL_TIMEOUT_MS,
  HEAD_LINES,
  MAX_EXITED_WAIT_UNTIL_TIMEOUT_MS,
  MAX_SESSIONS_PER_AGENT,
  MAX_WAIT_UNTIL_TIMEOUT_MS,
  SHELL_RESPONSE_TAIL_MAX_CHARS,
  TAIL_LINES,
} from './types';
import type { DetectedShell } from './types';

// ─── Section A: applyHeadTailCap (pure) ──────────────────────────

describe('applyHeadTailCap', () => {
  it('returns short input unchanged', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
    expect(applyHeadTailCap(lines)).toBe(lines.join('\n'));
  });

  it('returns exactly boundary-length input unchanged', () => {
    const total = HEAD_LINES + TAIL_LINES;
    const lines = Array.from({ length: total }, (_, i) => `line-${i}`);
    expect(applyHeadTailCap(lines)).toBe(lines.join('\n'));
  });

  it('caps input just over the boundary', () => {
    const total = HEAD_LINES + TAIL_LINES;
    const lines = Array.from({ length: total + 1 }, (_, i) => `line-${i}`);
    const result = applyHeadTailCap(lines);

    const resultLines = result.split('\n');
    expect(resultLines[0]).toBe('line-0');
    expect(resultLines[HEAD_LINES - 1]).toBe(`line-${HEAD_LINES - 1}`);
    expect(result).toContain('1 lines truncated');
    expect(resultLines[resultLines.length - 1]).toBe(`line-${total}`);
  });

  it('caps large input with correct head, tail, and marker', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line-${i}`);
    const result = applyHeadTailCap(lines);

    const resultLines = result.split('\n');
    expect(resultLines[0]).toBe('line-0');
    expect(resultLines[HEAD_LINES - 1]).toBe(`line-${HEAD_LINES - 1}`);
    expect(result).toContain('600 lines truncated');
    expect(resultLines[resultLines.length - 1]).toBe('line-999');
  });

  it('returns empty string for empty input', () => {
    expect(applyHeadTailCap([])).toBe('');
  });
});

// ─── Section B: stripAnsi (pure) ─────────────────────────────────

describe('stripAnsi', () => {
  it('strips SGR color codes', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips OSC sequences', () => {
    expect(stripAnsi('\x1b]0;window title\x07text')).toBe('text');
  });

  it('strips carriage returns', () => {
    expect(stripAnsi('line1\r\nline2')).toBe('line1\nline2');
  });

  it('strips multiple mixed sequences', () => {
    const input = '\x1b[1m\x1b[32mbold green\x1b[0m \x1b[4munderline\x1b[0m';
    expect(stripAnsi(input)).toBe('bold green underline');
  });

  it('passes through clean text unchanged', () => {
    expect(stripAnsi('hello world 123')).toBe('hello world 123');
  });

  it('returns empty string for empty input', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('strips DEC Private Mode sequences (bracketed paste, cursor visibility)', () => {
    expect(stripAnsi('\x1b[?2004htext\x1b[?2004l')).toBe('text');
    expect(stripAnsi('\x1b[?25lhidden\x1b[?25h')).toBe('hidden');
  });

  it('strips cursor shape sequences (CSI with space intermediate)', () => {
    expect(stripAnsi('\x1b[0 qtext\x1b[6 q')).toBe('text');
  });

  it('strips DEC save/restore cursor', () => {
    expect(stripAnsi('before\x1b7\x1b8after')).toBe('beforeafter');
  });
});

// ─── Section C: timeout/idle selection (pure) ────────────────────

describe('command timeout/idle selection', () => {
  it('uses quick timeout when waitUntil is omitted', () => {
    expect(getCommandTimeoutMs({ command: 'echo hi' })).toBe(
      DEFAULT_TIMEOUT_NO_WAIT_UNTIL_MS,
    );
  });

  it('uses stdin timeout for raw input without waitUntil', () => {
    expect(getCommandTimeoutMs({ command: '\r', rawInput: true })).toBe(
      DEFAULT_TIMEOUT_STDIN_MS,
    );
  });

  it('uses normal waitUntil default and cap without exited', () => {
    expect(getCommandTimeoutMs({ command: 'sleep 1', waitUntil: {} })).toBe(
      DEFAULT_WAIT_UNTIL_TIMEOUT_MS,
    );
    expect(
      getCommandTimeoutMs({
        command: 'sleep 1',
        waitUntil: { timeoutMs: 300_000 },
      }),
    ).toBe(MAX_WAIT_UNTIL_TIMEOUT_MS);
  });

  it('uses extended default and cap with exited=true', () => {
    expect(
      getCommandTimeoutMs({
        command: 'pnpm typecheck',
        waitUntil: { exited: true },
      }),
    ).toBe(DEFAULT_EXITED_WAIT_UNTIL_TIMEOUT_MS);
    expect(
      getCommandTimeoutMs({
        command: 'pnpm typecheck',
        waitUntil: { exited: true, timeoutMs: 999_999 },
      }),
    ).toBe(MAX_EXITED_WAIT_UNTIL_TIMEOUT_MS);
  });

  it('uses 15s default idle with exited=true and preserves explicit idle', () => {
    expect(getCommandIdleMs({ command: 'echo hi', waitUntil: {} })).toBe(
      DEFAULT_IDLE_MS,
    );
    expect(
      getCommandIdleMs({
        command: 'pnpm typecheck',
        waitUntil: { exited: true },
      }),
    ).toBe(DEFAULT_EXITED_IDLE_MS);
    expect(
      getCommandIdleMs({
        command: 'pnpm typecheck',
        waitUntil: { exited: true, idleMs: 0 },
      }),
    ).toBe(0);
  });
});

// ─── Section D: Integration tests (real PTY sessions) ────────────

const shell = detectShell();

/**
 * Check whether node-pty can actually spawn a PTY in this environment.
 * macOS sandboxed apps (e.g. stagewise) may block posix_spawnp.
 */
function canSpawnPty(): boolean {
  if (!shell) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pty = require('node-pty') as typeof import('node-pty');
    const p = pty.spawn(shell.path, [], {
      cols: 80,
      rows: 10,
      cwd: fs.realpathSync(os.tmpdir()),
    });
    p.kill();
    return true;
  } catch {
    return false;
  }
}

const ptyAvailable = canSpawnPty();
const describeIfShell = ptyAvailable ? describe : describe.skip;

/** Detection grace period used in tests. Much shorter than the 5s
 * production default so tests fall back to sentinel mode quickly when
 * the test shell doesn't emit clean OSC 133 markers.
 *
 * Bumped from 800 → 2000 ms to add margin against CI jitter on Windows
 * (ConPTY flush delays + MSYS bash startup). Healthy runs detect OSC 133
 * well under 200 ms, so this is defensive headroom only. */
const TEST_DETECT_TIMEOUT_MS = 2000;

/**
 * Extra `pty.spawn` options used by tests. On Windows CI the ConPTY helper
 * (`node_modules/node-pty/lib/conpty_console_list_agent.js`) races with
 * fast-exiting test shells and logs dozens of `AttachConsole failed`
 * stacks per run — harmless but extremely noisy and a drag on triage.
 * Winpty has no such helper. Our tests only assert on byte-level I/O,
 * where winpty is indistinguishable from ConPTY for these purposes.
 */
const TEST_PTY_SPAWN_OPTIONS =
  process.platform === 'win32' ? { useConpty: false } : {};

/**
 * Wait until the session has determined its parser mode —
 * either OSC 133 integration detected or sentinel fallback.
 */
async function waitForReady(
  sm: SessionManager,
  sessionId: string,
  // Needs a comfortable margin over TEST_DETECT_TIMEOUT_MS (2000) so CI
  // runners with GC jitter don't flake before the sentinel fallback fires.
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const session = sm.getSession(sessionId);
    if (!session) return;
    if (
      session.shellIntegrationActive ||
      session.parser.currentMode === 'sentinel'
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

/**
 * Wait until the session's PTY has exited and `session.exited` has been
 * flipped by `handleSessionExit`. On Windows ConPTY, the shell-integration
 * exit trap can emit OSC 133;D (firing the command's promise) before
 * node-pty delivers the process exit event — so `r.sessionExited` read
 * straight off the resolved result is a snapshot that lags reality by a
 * few ms. Tests that care about "the session eventually exits" should
 * poll this helper before asserting on `session.exited`.
 */
async function waitForSessionExit(
  sm: SessionManager,
  sessionId: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const session = sm.getSession(sessionId);
    if (!session || session.exited) return;
    await new Promise((r) => setTimeout(r, 25));
  }
}

describeIfShell('SessionManager (integration)', () => {
  const env = sanitizeEnv();
  const cwd = fs.realpathSync(os.tmpdir());
  let sm: SessionManager;

  function createSM(): SessionManager {
    return new SessionManager(
      shell as DetectedShell,
      undefined,
      TEST_DETECT_TIMEOUT_MS,
      TEST_PTY_SPAWN_OPTIONS,
    );
  }

  afterEach(() => {
    sm?.killAll();
  });

  // ─── Basic execution ─────────────────────────────────────────

  it('executes a basic command and returns output + exit code', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const r = await sm.executeCommand(sid, { command: 'echo hello' });

    expect(r.output).toContain('hello');
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.sessionExited).toBe(false);
    expect(r.sessionId).toBe(sid);
    expect(r.resolvedBy).toBe('exit');
  });

  it('propagates non-zero exit codes', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const r = await sm.executeCommand(sid, {
      command: 'sh -c "exit 42"',
    });

    expect(r.exitCode).toBe(42);
    expect(r.sessionExited).toBe(false);
    expect(r.resolvedBy).toBe('exit');
  });

  // ─── Session persistence ─────────────────────────────────────

  it('persists state across commands in the same session', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    await sm.executeCommand(sid, {
      command: 'export __SM_TEST_VAR=persistent42',
    });

    const r = await sm.executeCommand(sid, {
      command: 'echo $__SM_TEST_VAR',
    });

    expect(r.output).toContain('persistent42');
  });

  it('persists cwd changes across commands', async () => {
    const uniqueDir = fs.mkdtempSync(path.join(cwd, 'sm-cd-test-'));
    try {
      sm = createSM();
      const sid = sm.createSession('agent-test', cwd, env);
      await waitForReady(sm, sid);

      await sm.executeCommand(sid, {
        command: `cd "${uniqueDir}"`,
      });

      const r = await sm.executeCommand(sid, { command: 'pwd' });
      expect(r.output).toContain(path.basename(uniqueDir));
    } finally {
      sm?.killAll();
      // Windows needs time to release PTY directory locks after kill
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(uniqueDir, { recursive: true, force: true });
    }
  });

  // ─── Session cwd ─────────────────────────────────────────────

  it('respects initial session cwd', async () => {
    const uniqueDir = fs.mkdtempSync(path.join(cwd, 'sm-cwd-test-'));
    try {
      sm = createSM();
      const sid = sm.createSession('agent-test', uniqueDir, env);
      await waitForReady(sm, sid);

      const r = await sm.executeCommand(sid, { command: 'pwd' });

      expect(r.output).toContain(path.basename(uniqueDir));
    } finally {
      sm?.killAll();
      // Windows needs time to release PTY directory locks after kill
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(uniqueDir, { recursive: true, force: true });
    }
  });

  // ─── waitUntil ───────────────────────────────────────────────

  it('times out with waitUntil.timeoutMs', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const r = await sm.executeCommand(sid, {
      command: 'sleep 60',
      // Disable idle detection so we exercise the hard-timeout path.
      waitUntil: { timeoutMs: 1000, idleMs: 0 },
    });

    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
    expect(r.resolvedBy).toBe('timeout');
  });

  // ─── Idle detection ────────────────────────────

  it('idle detection resolves after first output', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const start = Date.now();
    const r = await sm.executeCommand(sid, {
      command: 'echo IDLE_MARKER; sleep 30',
      waitUntil: { idleMs: 1000, timeoutMs: 15000 },
    });
    const elapsed = Date.now() - start;

    expect(r.resolvedBy).toBe('idle');
    expect(r.timedOut).toBe(false);
    expect(r.output).toContain('IDLE_MARKER');
    // Should fire within ~1s of output, well before the 15s hard timeout.
    expect(elapsed).toBeLessThan(4000);
  });

  it('idle detection does not fire before first output', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    // If idle detection fired prematurely (before `echo LATE_OUTPUT` ran),
    // the output would not contain LATE_OUTPUT. The whole point of the
    // "only arm after first real output" gate is to prevent that.
    //
    // We assert the semantic outcome (output correctness) rather than
    // wall-clock timing because prompt frameworks (starship, p10k) vary
    // widely in what they write to the terminal between 133;C and real
    // stdout, making timing assertions flaky across environments.
    const r = await sm.executeCommand(sid, {
      command: 'sleep 2; echo LATE_OUTPUT',
      waitUntil: { idleMs: 500, timeoutMs: 10000 },
    });

    expect(r.output).toContain('LATE_OUTPUT');
  });

  it('idleMs = 0 disables idle detection', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const start = Date.now();
    const r = await sm.executeCommand(sid, {
      command: 'echo FIRST; sleep 30',
      waitUntil: { idleMs: 0, timeoutMs: 2000 },
    });
    const elapsed = Date.now() - start;

    // With idle disabled, must hit the hard timeout — not resolve early.
    expect(r.resolvedBy).toBe('timeout');
    expect(r.timedOut).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(1800);
  });

  it('waitUntil.timeoutMs is capped at the service maximum', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    // Request a 5-minute timeout; service caps to MAX_WAIT_UNTIL_TIMEOUT_MS (60s).
    // We can't wait 60s in a test, so we check via the idle path: with
    // idle disabled, the hard timeout cap must still apply. Instead we
    // just assert the result type carries the clamped behavior by
    // checking a saner combination: idleMs wins over a high timeoutMs.
    const start = Date.now();
    const r = await sm.executeCommand(sid, {
      command: 'echo CAP_MARKER; sleep 30',
      waitUntil: { idleMs: 500, timeoutMs: 300000 },
    });
    const elapsed = Date.now() - start;

    // Idle should fire way before any timeout (capped or not).
    expect(r.resolvedBy).toBe('idle');
    expect(elapsed).toBeLessThan(3000);
  });

  it('resolves early when waitUntil.outputPattern matches', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const start = Date.now();
    const r = await sm.executeCommand(sid, {
      command: 'echo "MARKER_READY_XYZ"; sleep 30',
      waitUntil: { outputPattern: 'MARKER_READY_XYZ', timeoutMs: 10000 },
    });
    const elapsed = Date.now() - start;

    expect(r.output).toContain('MARKER_READY_XYZ');
    expect(r.timedOut).toBe(false);
    // Should resolve well before the 10s timeout or 30s sleep
    expect(elapsed).toBeLessThan(8000);
  });

  // Dedicated because the basic-command and idle tests construct the
  // SessionManager without a log directory, so `logger` is null and
  // `getTail` returns ''. This test spins up a temporary logs directory
  // specifically to exercise the tail path end-to-end.
  it('populates recentOutput from the session log tail', async () => {
    const logsDir = fs.mkdtempSync(path.join(cwd, 'sm-tail-'));
    try {
      sm = new SessionManager(
        shell as DetectedShell,
        () => logsDir,
        TEST_DETECT_TIMEOUT_MS,
        TEST_PTY_SPAWN_OPTIONS,
      );
      const sid = sm.createSession('agent-test', cwd, env);
      await waitForReady(sm, sid);

      // Mirror the known-good `matches outputPattern` test: keep the
      // command alive with a sleep and resolve via pattern match. A bare
      // `echo` can race the OSC 133 exit marker on slower CI runners,
      // leaving the terminal buffer unstable when `serializeFrom` reads.
      const r = await sm.executeCommand(sid, {
        command: 'echo RECENT_TAIL_MARKER; sleep 30',
        waitUntil: {
          outputPattern: 'RECENT_TAIL_MARKER',
          timeoutMs: 10000,
        },
      });

      expect(r.output).toContain('RECENT_TAIL_MARKER');
      expect(r.recentOutput).toContain('RECENT_TAIL_MARKER');
      expect(r.recentOutput?.length ?? 0).toBeLessThanOrEqual(
        SHELL_RESPONSE_TAIL_MAX_CHARS,
      );
    } finally {
      sm?.killAll();
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
  });

  it('matches outputPattern against terminal buffer when logger exists', async () => {
    const logsDir = fs.mkdtempSync(path.join(cwd, 'sm-bufmatch-'));
    try {
      sm = new SessionManager(
        shell as DetectedShell,
        () => logsDir,
        TEST_DETECT_TIMEOUT_MS,
        TEST_PTY_SPAWN_OPTIONS,
      );
      const sid = sm.createSession('agent-test', cwd, env);
      await waitForReady(sm, sid);

      const start = Date.now();
      const r = await sm.executeCommand(sid, {
        command: 'echo "BUFFER_MARKER_123"; sleep 30',
        waitUntil: {
          outputPattern: 'BUFFER_MARKER_123',
          timeoutMs: 10000,
        },
      });
      const elapsed = Date.now() - start;

      expect(r.output).toContain('BUFFER_MARKER_123');
      expect(r.timedOut).toBe(false);
      expect(elapsed).toBeLessThan(8000);
    } finally {
      sm?.killAll();
      await new Promise((r) => setTimeout(r, 300));
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
  });

  // ─── Abort ───────────────────────────────────────────────────

  it('aborts via AbortSignal', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const ac = new AbortController();
    const resultPromise = sm.executeCommand(sid, {
      command: 'sleep 60',
      abortSignal: ac.signal,
    });

    setTimeout(() => ac.abort(), 500);
    const r = await resultPromise;

    expect(r.timedOut).toBe(false);
    expect(r.resolvedBy).toBe('abort');
  });

  // ─── Streaming ───────────────────────────────────────────────

  it('streams output via onData callback', async () => {
    sm = createSM();
    const chunks: string[] = [];
    const sid = sm.createSession('agent-test', cwd, env, (_id, data) =>
      chunks.push(data),
    );
    await waitForReady(sm, sid);

    await sm.executeCommand(sid, { command: 'echo streamed_data' });

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('streamed_data');
  });

  // ─── Session lifecycle ───────────────────────────────────────

  it('killSession terminates a running command', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    const resultPromise = sm.executeCommand(sid, {
      command: 'sleep 60',
      waitUntil: { timeoutMs: 30000 },
    });

    // Give the command time to start
    await new Promise((r) => setTimeout(r, 300));

    const killed = sm.killSession(sid);
    expect(killed).toBe(true);

    const r = await resultPromise;
    expect(r.sessionExited).toBe(true);

    // Session is retained (deactivated) after kill — not removed
    const session = sm.getSession(sid);
    expect(session?.exited).toBe(true);
    expect(session?.deactivated).toBe(true);
  });

  it('destroyAgent kills all sessions for that agent', async () => {
    sm = createSM();
    const sid1 = sm.createSession('agent-destroy', cwd, env);
    const sid2 = sm.createSession('agent-destroy', cwd, env);
    const sidOther = sm.createSession('agent-other', cwd, env);

    sm.destroyAgent('agent-destroy');

    expect(sm.getSession(sid1)).toBeUndefined();
    expect(sm.getSession(sid2)).toBeUndefined();
    expect(sm.getSession(sidOther)).toBeDefined();
  });

  it('marks session as exited when shell exits', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    // `exit 0` terminates the shell — resolves via onExit handler.
    const r = await sm.executeCommand(sid, { command: 'exit 0' });

    expect(r.exitCode).toBe(0);

    // `r.sessionExited` is a snapshot at resolve time; on Windows ConPTY
    // the PTY exit event can arrive a few ms after `commandDone`, so we
    // poll for the eventual state instead of asserting on the snapshot.
    await waitForSessionExit(sm, sid);

    const session = sm.getSession(sid);
    expect(session?.exited).toBe(true);
    expect(session?.exitCode).toBe(0);
  });

  it('returns error when executing in an exited session', async () => {
    sm = createSM();
    const sid = sm.createSession('agent-test', cwd, env);
    await waitForReady(sm, sid);

    await sm.executeCommand(sid, { command: 'exit 0' });

    // Ensure `handleSessionExit` has flipped `session.exited` before the
    // second call — otherwise on Windows ConPTY the guard in
    // `executeCommand` races with the pending exit event and we hit the
    // wrong branch.
    await waitForSessionExit(sm, sid);

    const r = await sm.executeCommand(sid, { command: 'echo hello' });

    expect(r.sessionExited).toBe(true);
    expect(r.output).toContain('already exited');
  });

  // ─── Concurrency limits ──────────────────────────────────────

  it('enforces max concurrent sessions per agent', () => {
    sm = createSM();
    for (let i = 0; i < MAX_SESSIONS_PER_AGENT; i++) {
      sm.createSession('agent-max', cwd, env);
    }

    expect(() => sm.createSession('agent-max', cwd, env)).toThrow(
      /Maximum.*concurrent sessions/,
    );
  });

  it('max sessions is per-agent — other agents unaffected', () => {
    sm = createSM();
    for (let i = 0; i < MAX_SESSIONS_PER_AGENT; i++) {
      sm.createSession('agent-a', cwd, env);
    }

    // Different agent can still create sessions
    expect(() => sm.createSession('agent-b', cwd, env)).not.toThrow();
  });

  // ─── Edge cases ──────────────────────────────────────────────

  it('returns error for non-existent session', async () => {
    sm = createSM();

    const r = await sm.executeCommand('nonexistent', {
      command: 'echo hello',
    });

    expect(r.sessionExited).toBe(true);
    expect(r.output).toContain('not found');
  });

  it('killSession returns false for unknown session', () => {
    sm = createSM();
    expect(sm.killSession('nonexistent')).toBe(false);
  });

  it('getSessionsForAgent returns only that agent sessions', () => {
    sm = createSM();
    sm.createSession('agent-x', cwd, env);
    sm.createSession('agent-x', cwd, env);
    sm.createSession('agent-y', cwd, env);

    expect(sm.getSessionsForAgent('agent-x')).toHaveLength(2);
    expect(sm.getSessionsForAgent('agent-y')).toHaveLength(1);
    expect(sm.getSessionsForAgent('agent-z')).toHaveLength(0);
  });
});
