import { describe, it, expect } from 'vitest';
import type { EnabledSkillsSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeSkillsChanges } from './skills-changes';

function makeSnap(paths: string[]): EnabledSkillsSnapshot {
  return { paths };
}

describe('computeSkillsChanges', () => {
  it('returns empty array when previous is null', () => {
    expect(
      computeSkillsChanges(null, makeSnap(['w1/.stagewise/skills/foo'])),
    ).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snap = makeSnap(['w1/.stagewise/skills/foo', 'plugins/bar/SKILL.md']);
    expect(computeSkillsChanges(snap, snap)).toEqual([]);
  });

  it('skill-enabled carries path attribute (no summary)', () => {
    const result = computeSkillsChanges(
      makeSnap([]),
      makeSnap(['w1/.stagewise/skills/foo']),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('skill-enabled');
    expect(result[0].attributes?.path).toBe('w1/.stagewise/skills/foo');
    expect(result[0].summary).toBeUndefined();
  });

  it('skill-disabled carries path attribute (no summary)', () => {
    const result = computeSkillsChanges(
      makeSnap(['plugins/bar/SKILL.md']),
      makeSnap([]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('skill-disabled');
    expect(result[0].attributes?.path).toBe('plugins/bar/SKILL.md');
    expect(result[0].summary).toBeUndefined();
  });

  it('detects multiple skills changed at once', () => {
    const prev = makeSnap([
      'w1/.stagewise/skills/kept',
      'w1/.agents/skills/removed',
    ]);
    const curr = makeSnap([
      'w1/.stagewise/skills/kept',
      'plugins/new-plugin/SKILL.md',
    ]);
    const result = computeSkillsChanges(prev, curr);
    expect(result).toHaveLength(2);
    expect(
      result.find((r) => r.type === 'skill-enabled')?.attributes?.path,
    ).toBe('plugins/new-plugin/SKILL.md');
    expect(
      result.find((r) => r.type === 'skill-disabled')?.attributes?.path,
    ).toBe('w1/.agents/skills/removed');
  });
});
