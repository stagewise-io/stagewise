import { describe, it, expect } from 'vitest';
import type { WorkspaceSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeWorkspaceChanges } from './workspace-changes';

function makeWs(
  ...mounts: Array<{ prefix: string; path: string }>
): WorkspaceSnapshot {
  return { mounts };
}

describe('computeWorkspaceChanges', () => {
  it('returns empty array when previous is null', () => {
    const current = makeWs({ prefix: 'w1', path: '/home/user/project' });
    expect(computeWorkspaceChanges(null, current)).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snap = makeWs({ prefix: 'w1', path: '/home/user/project' });
    expect(computeWorkspaceChanges(snap, snap)).toEqual([]);
  });

  it('returns empty array when both have no mounts', () => {
    expect(computeWorkspaceChanges(makeWs(), makeWs())).toEqual([]);
  });

  it('workspace-mounted carries prefix and path attributes', () => {
    const result = computeWorkspaceChanges(
      makeWs(),
      makeWs({ prefix: 'w1', path: '/home/user/project' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-mounted');
    expect(result[0].attributes).toEqual({
      prefix: 'w1',
      path: '/home/user/project',
    });
    expect(result[0].summary).toBeUndefined();
  });

  it('workspace-unmounted carries prefix and path attributes', () => {
    const result = computeWorkspaceChanges(
      makeWs({ prefix: 'w1', path: '/home/user/project' }),
      makeWs(),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-unmounted');
    expect(result[0].attributes).toEqual({
      prefix: 'w1',
      path: '/home/user/project',
    });
  });

  it('workspace-path-changed carries prefix, from, and to attributes', () => {
    const result = computeWorkspaceChanges(
      makeWs({ prefix: 'w1', path: '/home/user/old' }),
      makeWs({ prefix: 'w1', path: '/home/user/new' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('workspace-path-changed');
    expect(result[0].attributes).toEqual({
      prefix: 'w1',
      from: '/home/user/old',
      to: '/home/user/new',
    });
  });

  it('detects multiple mounts with mixed changes', () => {
    const previous = makeWs(
      { prefix: 'w1', path: '/home/user/kept' },
      { prefix: 'w2', path: '/home/user/removed' },
      { prefix: 'w3', path: '/home/user/changed-old' },
    );
    const current = makeWs(
      { prefix: 'w1', path: '/home/user/kept' },
      { prefix: 'w3', path: '/home/user/changed-new' },
      { prefix: 'w4', path: '/home/user/added' },
    );
    const result = computeWorkspaceChanges(previous, current);
    expect(result).toHaveLength(3);
    const byType = Object.fromEntries(
      result.map((e) => [e.type, e.attributes]),
    );
    expect(byType['workspace-path-changed']).toEqual({
      prefix: 'w3',
      from: '/home/user/changed-old',
      to: '/home/user/changed-new',
    });
    expect(byType['workspace-mounted']).toEqual({
      prefix: 'w4',
      path: '/home/user/added',
    });
    expect(byType['workspace-unmounted']).toEqual({
      prefix: 'w2',
      path: '/home/user/removed',
    });
  });
});
