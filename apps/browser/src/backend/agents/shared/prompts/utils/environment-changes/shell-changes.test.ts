import { describe, it, expect } from 'vitest';
import type { ShellSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeShellChanges } from './shell-changes';

function makeSnapshot(
  sessions: Array<{
    id: string;
    exited?: boolean;
    exitCode?: number | null;
    lineCount?: number;
    logPath?: string;
    tailContent?: string;
  }>,
): ShellSnapshot {
  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      exited: s.exited ?? false,
      exitCode: s.exitCode ?? null,
      lineCount: s.lineCount ?? 0,
      logPath: s.logPath ?? `shells/${s.id}.shell.log`,
      tailContent: s.tailContent,
      cwd: '/',
      createdAt: Date.now(),
    })),
  };
}

function types(entries: ReturnType<typeof computeShellChanges>): string[] {
  return entries.map((e) => e.type);
}

function attrs(entries: ReturnType<typeof computeShellChanges>, type: string) {
  return entries.find((e) => e.type === type)?.attributes;
}

describe('computeShellChanges', () => {
  it('returns empty when both snapshots are empty', () => {
    const snap = makeSnapshot([]);
    expect(computeShellChanges(snap, snap)).toEqual([]);
  });

  it('returns empty when nothing changed', () => {
    const snap = makeSnapshot([
      { id: 'a', lineCount: 10 },
      { id: 'b', lineCount: 5 },
    ]);
    expect(computeShellChanges(snap, snap)).toEqual([]);
  });

  it('emits shell-session-started for new sessions', () => {
    const prev = makeSnapshot([]);
    const curr = makeSnapshot([
      { id: 'new-1', logPath: 'shells/new-1.shell.log' },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-started']);
    expect(attrs(result, 'shell-session-started')).toEqual({
      sessionId: 'new-1',
      lineCount: '0',
      logPath: 'shells/new-1.shell.log',
    });
  });

  it('includes tailContent as summary on shell-session-started', () => {
    const prev = makeSnapshot([]);
    const curr = makeSnapshot([
      { id: 'new-1', lineCount: 5, tailContent: '$ echo hello\nhello\n' },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-started']);
    expect(attrs(result, 'shell-session-started')).toEqual({
      sessionId: 'new-1',
      lineCount: '5',
      logPath: 'shells/new-1.shell.log',
    });
    expect(result[0].summary).toBe('$ echo hello\nhello\n');
  });

  it('omits summary when tailContent is empty', () => {
    const prev = makeSnapshot([]);
    const curr = makeSnapshot([{ id: 'new-1', tailContent: '' }]);

    const result = computeShellChanges(prev, curr);
    expect(result[0].summary).toBeUndefined();
  });

  it('emits shell-session-killed for removed sessions', () => {
    const prev = makeSnapshot([{ id: 'old-1' }]);
    const curr = makeSnapshot([]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-killed']);
    expect(attrs(result, 'shell-session-killed')).toEqual({
      sessionId: 'old-1',
    });
  });

  it('emits shell-session-exited when session transitions to exited', () => {
    const prev = makeSnapshot([{ id: 's1', exited: false, lineCount: 5 }]);
    const curr = makeSnapshot([
      { id: 's1', exited: true, exitCode: 1, lineCount: 10 },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-exited']);
    expect(attrs(result, 'shell-session-exited')).toEqual({
      sessionId: 's1',
      exitCode: '1',
      logPath: 'shells/s1.shell.log',
    });
  });

  it('uses "?" for null exitCode on exit', () => {
    const prev = makeSnapshot([{ id: 's1' }]);
    const curr = makeSnapshot([{ id: 's1', exited: true, exitCode: null }]);

    const result = computeShellChanges(prev, curr);
    expect(attrs(result, 'shell-session-exited')?.exitCode).toBe('?');
  });

  it('emits shell-session-new-output when lineCount increases', () => {
    const prev = makeSnapshot([{ id: 's1', lineCount: 10 }]);
    const curr = makeSnapshot([
      { id: 's1', lineCount: 57, tailContent: 'last line\n' },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-new-output']);
    expect(attrs(result, 'shell-session-new-output')).toEqual({
      sessionId: 's1',
      lineCount: '47',
      logPath: 'shells/s1.shell.log',
    });
    expect(result[0].summary).toBe('last line\n');
  });

  it('includes tailContent as summary on shell-session-exited', () => {
    const prev = makeSnapshot([{ id: 's1', exited: false, lineCount: 5 }]);
    const curr = makeSnapshot([
      {
        id: 's1',
        exited: true,
        exitCode: 1,
        lineCount: 10,
        tailContent: 'Error: fail\n',
      },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-exited']);
    expect(result[0].summary).toBe('Error: fail\n');
  });

  it('does not emit new-output when lineCount is unchanged', () => {
    const prev = makeSnapshot([{ id: 's1', lineCount: 10 }]);
    const curr = makeSnapshot([{ id: 's1', lineCount: 10 }]);

    expect(computeShellChanges(prev, curr)).toEqual([]);
  });

  it('exit suppresses new-output for the same session', () => {
    const prev = makeSnapshot([{ id: 's1', exited: false, lineCount: 5 }]);
    const curr = makeSnapshot([
      { id: 's1', exited: true, exitCode: 0, lineCount: 100 },
    ]);

    const result = computeShellChanges(prev, curr);
    expect(types(result)).toEqual(['shell-session-exited']);
    // No shell-session-new-output despite lineCount 5 → 100
  });

  it('handles multiple independent session changes', () => {
    const prev = makeSnapshot([
      { id: 'started-before', lineCount: 10 },
      { id: 'will-exit', lineCount: 20 },
      { id: 'will-die' },
      { id: 'stable', lineCount: 5 },
    ]);
    const curr = makeSnapshot([
      { id: 'started-before', lineCount: 50, tailContent: 'output...' },
      { id: 'will-exit', exited: true, exitCode: 137, lineCount: 25 },
      // 'will-die' removed
      { id: 'stable', lineCount: 5 },
      { id: 'brand-new' },
    ]);

    const result = computeShellChanges(prev, curr);
    const typeList = types(result);

    expect(typeList).toContain('shell-session-killed');
    expect(typeList).toContain('shell-session-new-output');
    expect(typeList).toContain('shell-session-exited');
    expect(typeList).toContain('shell-session-started');
    // stable has no changes — no entry
    expect(typeList).not.toContain('shell-session-stable');
    expect(result).toHaveLength(4);

    // Verify specific attributes
    expect(
      result.find((e) => e.type === 'shell-session-killed')?.attributes
        ?.sessionId,
    ).toBe('will-die');
    const newOutput = result.find((e) => e.type === 'shell-session-new-output');
    expect(newOutput?.attributes?.lineCount).toBe('40');
    expect(newOutput?.summary).toBe('output...');
    expect(
      result.find((e) => e.type === 'shell-session-exited')?.attributes
        ?.exitCode,
    ).toBe('137');
    const started = result.find((e) => e.type === 'shell-session-started');
    expect(started?.attributes?.sessionId).toBe('brand-new');
    expect(started?.attributes?.lineCount).toBe('0');
  });
});
