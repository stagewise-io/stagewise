import { describe, it, expect } from 'vitest';
import type { AgentsMdSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeAgentsMdChanges } from './agents-md-changes';

function makeSnap(
  entries: Array<{ mountPrefix: string; content: string }>,
  respectedMounts: string[] = [],
): AgentsMdSnapshot {
  return { entries, respectedMounts };
}

describe('computeAgentsMdChanges', () => {
  it('returns empty array when previous is null', () => {
    expect(
      computeAgentsMdChanges(
        null,
        makeSnap([{ mountPrefix: 'w1', content: 'x' }]),
      ),
    ).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snap = makeSnap(
      [{ mountPrefix: 'w1', content: '# Rules\nBe nice.' }],
      ['w1'],
    );
    expect(computeAgentsMdChanges(snap, snap)).toEqual([]);
  });

  it('detects AGENTS.md created with full content in detail', () => {
    const prev = makeSnap([]);
    const curr = makeSnap([{ mountPrefix: 'w1', content: '# New rules' }]);
    const result = computeAgentsMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('agents-md-created');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].detail).toBe('# New rules');
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects AGENTS.md updated with unified diff in detail', () => {
    const prev = makeSnap([
      { mountPrefix: 'w1', content: 'line1\nold line\nline3' },
    ]);
    const curr = makeSnap([
      { mountPrefix: 'w1', content: 'line1\nnew line\nline3' },
    ]);
    const result = computeAgentsMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('agents-md-updated');
    expect(result[0].detail).toContain('-old line');
    expect(result[0].detail).toContain('+new line');
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects AGENTS.md deleted', () => {
    const prev = makeSnap([{ mountPrefix: 'w1', content: 'content' }]);
    const curr = makeSnap([]);
    const result = computeAgentsMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('agents-md-deleted');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects AGENTS.md enabled (respect toggled on)', () => {
    const prev = makeSnap([{ mountPrefix: 'w1', content: 'x' }], []);
    const curr = makeSnap([{ mountPrefix: 'w1', content: 'x' }], ['w1']);
    const result = computeAgentsMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('agents-md-enabled');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('detects AGENTS.md disabled (respect toggled off)', () => {
    const prev = makeSnap([{ mountPrefix: 'w1', content: 'x' }], ['w1']);
    const curr = makeSnap([{ mountPrefix: 'w1', content: 'x' }], []);
    const result = computeAgentsMdChanges(prev, curr);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('agents-md-disabled');
    expect(result[0].summary).toBeUndefined();
    expect(result[0].attributes?.path).toBe('w1');
  });

  it('handles multiple mounts with mixed changes', () => {
    const prev = makeSnap(
      [
        { mountPrefix: 'w1', content: 'original' },
        { mountPrefix: 'w2', content: 'stays' },
        { mountPrefix: 'w3', content: 'going away' },
      ],
      ['w1'],
    );
    const curr = makeSnap(
      [
        { mountPrefix: 'w1', content: 'modified' },
        { mountPrefix: 'w2', content: 'stays' },
        { mountPrefix: 'w4', content: 'brand new' },
      ],
      ['w1', 'w4'],
    );
    const result = computeAgentsMdChanges(prev, curr);
    const types = result.map((r) => r.type);
    expect(types).toContain('agents-md-updated');
    expect(types).toContain('agents-md-deleted');
    expect(types).toContain('agents-md-created');
    expect(types).toContain('agents-md-enabled');
    expect(types).not.toContain('agents-md-disabled');
  });
});
