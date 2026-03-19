import { describe, it, expect } from 'vitest';
import type { WorkspaceMdSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeWorkspaceMdChanges } from './workspace-md-changes';

function makeSnap(
  entries: Array<{ mountPrefix: string; content: string }>,
): WorkspaceMdSnapshot {
  return { entries };
}

describe('computeWorkspaceMdChanges', () => {
  it('returns empty array when previous is null', () => {
    expect(
      computeWorkspaceMdChanges(
        null,
        makeSnap([{ mountPrefix: 'w1', content: 'x' }]),
      ),
    ).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snap = makeSnap([
      { mountPrefix: 'w1', content: '# Workspace\nSome info.' },
    ]);
    expect(computeWorkspaceMdChanges(snap, snap)).toEqual([]);
  });

  it('detects WORKSPACE.md created with full content in detail', () => {
    const prev = makeSnap([]);
    const curr = makeSnap([{ mountPrefix: 'w1', content: '# My Project' }]);
    const result = computeWorkspaceMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-md-created');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].detail).toBe('# My Project');
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects WORKSPACE.md updated with unified diff in detail', () => {
    const prev = makeSnap([
      { mountPrefix: 'w1', content: 'line1\nold\nline3' },
    ]);
    const curr = makeSnap([
      { mountPrefix: 'w1', content: 'line1\nnew\nline3' },
    ]);
    const result = computeWorkspaceMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-md-updated');
    expect(result[0].detail).toContain('-old');
    expect(result[0].detail).toContain('+new');
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects WORKSPACE.md deleted', () => {
    const prev = makeSnap([{ mountPrefix: 'w1', content: 'content' }]);
    const curr = makeSnap([]);
    const result = computeWorkspaceMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-md-deleted');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('handles multiple mounts with mixed changes', () => {
    const prev = makeSnap([
      { mountPrefix: 'w1', content: 'original' },
      { mountPrefix: 'w2', content: 'stays' },
      { mountPrefix: 'w3', content: 'going away' },
    ]);
    const curr = makeSnap([
      { mountPrefix: 'w1', content: 'modified' },
      { mountPrefix: 'w2', content: 'stays' },
      { mountPrefix: 'w4', content: 'brand new' },
    ]);
    const result = computeWorkspaceMdChanges(prev, curr);
    const types = result.map((r) => r.type);
    expect(types).toContain('workspace-md-updated');
    expect(types).toContain('workspace-md-deleted');
    expect(types).toContain('workspace-md-created');
    expect(result).toHaveLength(3);
  });
});
