import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { applyHeadTailCap, ProcessManager } from './process-manager';
import { detectShell } from './detect-shell';
import { sanitizeEnv } from './sanitize-env';
import { HEAD_LINES, TAIL_LINES } from './types';
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

// ─── Section B: Integration tests (real processes) ───────────────

const shell = detectShell();
const describeIfShell = shell ? describe : describe.skip;

describeIfShell('ProcessManager (integration)', () => {
  const env = sanitizeEnv();
  const cwd = fs.realpathSync(os.tmpdir());
  let pm: ProcessManager;

  function createPM(): ProcessManager {
    return new ProcessManager(shell as DetectedShell);
  }

  afterEach(() => {
    pm?.killAll();
  });

  it('executes a basic command', async () => {
    pm = createPM();
    const { result } = pm.spawn(
      'agent-test',
      { command: 'echo hello', cwd },
      env,
    );
    const r = await result;

    expect(r.output).toContain('hello');
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
    expect(r.aborted).toBe(false);
  });

  it('propagates exit code', async () => {
    pm = createPM();
    const { result } = pm.spawn('agent-test', { command: 'exit 42', cwd }, env);
    const r = await result;

    expect(r.exitCode).toBe(42);
  });

  it('captures stderr in both output and stderr', async () => {
    pm = createPM();
    const { result } = pm.spawn(
      'agent-test',
      { command: 'echo err >&2', cwd },
      env,
    );
    const r = await result;

    expect(r.stderr).toContain('err');
    expect(r.output).toContain('err');
  });

  it('times out long-running commands', { timeout: 5000 }, async () => {
    pm = createPM();
    const { result } = pm.spawn(
      'agent-test',
      { command: 'sleep 60', cwd, timeoutMs: 1000 },
      env,
    );
    const r = await result;

    expect(r.timedOut).toBe(true);
  });

  it('aborts via AbortSignal', { timeout: 5000 }, async () => {
    pm = createPM();
    const ac = new AbortController();

    const { result } = pm.spawn(
      'agent-test',
      { command: 'sleep 60', cwd, abortSignal: ac.signal },
      env,
    );

    setTimeout(() => ac.abort(), 200);
    const r = await result;

    expect(r.aborted).toBe(true);
  });

  it('respects cwd', async () => {
    // Use a uniquely-named subdir so we can assert on its basename.
    // Git Bash on Windows translates paths (e.g. C:\...\Temp → /tmp),
    // so comparing the full path from `pwd` against os.tmpdir() fails.
    const uniqueDir = fs.mkdtempSync(path.join(cwd, 'pm-cwd-test-'));
    try {
      pm = createPM();
      const { result } = pm.spawn(
        'agent-test',
        { command: 'pwd', cwd: uniqueDir },
        env,
      );
      const r = await result;

      expect(r.output).toContain(path.basename(uniqueDir));
    } finally {
      fs.rmSync(uniqueDir, { recursive: true, force: true });
    }
  });

  it('streams output via onOutput callback', async () => {
    pm = createPM();
    const chunks: string[] = [];

    const { result } = pm.spawn(
      'agent-test',
      { command: 'echo streamed', cwd },
      env,
      (chunk) => chunks.push(chunk),
    );
    await result;

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('streamed');
  });

  it(
    'killByAgent terminates tracked processes',
    { timeout: 10000 },
    async () => {
      pm = createPM();
      const { result } = pm.spawn(
        'agent-kill-test',
        { command: 'sleep 60', cwd },
        env,
      );

      pm.killByAgent('agent-kill-test');
      const r = await result;

      expect(r.exitCode).not.toBe(0);
    },
  );
});
