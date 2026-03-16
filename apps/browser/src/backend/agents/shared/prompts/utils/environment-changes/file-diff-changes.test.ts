import { describe, it, expect } from 'vitest';
import type {
  EnvironmentDiffSnapshot,
  FileDiffSnapshot,
} from '@shared/karton-contracts/ui/shared-types';
import { computeFileDiffChanges } from './file-diff-changes';

function makeSnapshot(
  overrides: Partial<FileDiffSnapshot> & { path: string },
): FileDiffSnapshot {
  return {
    fileId: overrides.fileId ?? `fid-${overrides.path}`,
    isExternal: overrides.isExternal ?? false,
    baselineOid: overrides.baselineOid ?? 'base-oid',
    currentOid: overrides.currentOid ?? 'curr-oid',
    hunkIds: overrides.hunkIds ?? ['hunk-1'],
    contributors: overrides.contributors ?? ['agent-1'],
    ...overrides,
  };
}

function makeEnv(
  pending: FileDiffSnapshot[],
  summary: FileDiffSnapshot[],
): EnvironmentDiffSnapshot {
  return { pending, summary };
}

function summaries(
  entries: ReturnType<typeof computeFileDiffChanges>,
): string[] {
  return entries.map((e) => e.summary);
}

const AGENT_ID = '1';
const ABS = '/home/user/project/src/file.txt';

describe('computeFileDiffChanges', () => {
  it('returns empty array when previous is null', () => {
    const current = makeEnv(
      [makeSnapshot({ path: ABS })],
      [makeSnapshot({ path: ABS })],
    );
    expect(computeFileDiffChanges(null, current, AGENT_ID)).toEqual([]);
  });

  it('returns empty array when nothing changed', () => {
    const snapshot = makeEnv(
      [makeSnapshot({ path: ABS })],
      [makeSnapshot({ path: ABS })],
    );
    expect(computeFileDiffChanges(snapshot, snapshot, AGENT_ID)).toEqual([]);
  });

  it('uses absolute paths in output', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['agent-99'] })],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-99]`);
  });

  it('does not report self edits when file first appears', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['agent-1'] })],
      [],
    );
    expect(computeFileDiffChanges(previous, current, AGENT_ID)).toEqual([]);
  });

  it('does not report self as modifier when self is among contributors', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old',
          contributors: ['agent-99'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new',
          contributors: ['agent-99', 'agent-1'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
    expect(summaries(result).join('')).not.toContain('you');
  });

  it('reports other agent when file appears in pending', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['agent-99'] })],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-99]`);
  });

  it('reports user when file appears with only user contributor', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['user'] })],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [user]`);
  });

  it('reports only other agents when self also contributed on first appearance', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-42]`);
    expect(result.join('')).not.toContain('you');
  });

  it('reports new contributor on file still in pending', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old-curr',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new-curr',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-42]`);
  });

  it('reports user modification via new contributor', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old-curr',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new-curr',
          contributors: ['agent-1', 'user'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [user]`);
  });

  it('reports new contributors from summary comparison', () => {
    const previous = makeEnv(
      [],
      [
        makeSnapshot({
          path: ABS,
          contributors: ['agent-1'],
        }),
      ],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-42]`);
  });

  it('detects edits gone when file disappears from pending (rejected, summary reverted)', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [],
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'reverted-oid',
          contributors: ['agent-1'],
        }),
      ],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS}: your edits no longer present`);
  });

  it('detects edits gone when file disappears from pending with no summary', () => {
    const previous = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['agent-1'] })],
      [],
    );
    const current = makeEnv([], []);
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS}: your edits no longer present`);
  });

  it('does not report edits gone when file was accepted (summary currentOid matches pending)', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
    );
    const current = makeEnv(
      [],
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('does not report edits gone when self was not contributor', () => {
    const previous = makeEnv(
      [makeSnapshot({ path: ABS, contributors: ['agent-99'] })],
      [],
    );
    const current = makeEnv([], []);
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('detects edits gone when self disappears from contributors in pending (no summary match)', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old-curr',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new-curr',
          contributors: ['agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS}: your edits no longer present`);
  });

  it('does not report edits gone when self disappears from pending contributors but summary reflects edits', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'shared-curr',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'shared-curr',
          contributors: ['agent-42'],
        }),
      ],
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'shared-curr',
          contributors: ['agent-1'],
        }),
      ],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('does not report partial removal when only self reduced hunks', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'old-curr',
          hunkIds: ['h1', 'h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'new-curr',
          hunkIds: ['h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('detects partial removal when external contributor reduced hunks', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'old-curr',
          hunkIds: ['h1', 'h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'new-curr',
          hunkIds: ['h2'],
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(
      `${ABS} modified by: [agent-42] (some of your edits were removed)`,
    );
  });

  it('combines modifier and editsGone when file disappears with modifier context', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old-curr',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new-curr',
          contributors: ['agent-42', 'user'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(
      `${ABS} modified by: [user] (your edits no longer present)`,
    );
  });

  it('combines modifier and partial removal', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'old-curr',
          hunkIds: ['h1', 'h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'new-curr',
          hunkIds: ['h2'],
          contributors: ['agent-1', 'user'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(
      `${ABS} modified by: [user] (some of your edits were removed)`,
    );
  });

  it('ignores files in pending where content did not change', () => {
    const snap = makeSnapshot({
      path: ABS,
      currentOid: 'same',
      contributors: ['agent-1'],
    });
    const previous = makeEnv([snap], []);
    const current = makeEnv([snap], []);
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('does not report self-edit when agent modifies its own file again', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'first-edit',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'second-edit',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('does not report self-edit even when hunks are reduced by self', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'first-edit',
          hunkIds: ['h1', 'h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base',
          currentOid: 'second-edit',
          hunkIds: ['h2'],
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('still reports when another agent modifies a file the agent also edited', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'first-edit',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'mixed-edit',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS} modified by: [agent-42]`);
  });

  it('does not report edits gone when agent reverts its own changes to baseline', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'agent-edit-oid',
          contributors: ['agent-1'],
        }),
      ],
    );
    const current = makeEnv(
      [],
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'base-oid',
          contributors: [],
        }),
      ],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('still reports edits gone when another contributor was present and file reverts to baseline', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'mixed-edit-oid',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [],
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'base-oid',
          currentOid: 'base-oid',
          contributors: [],
        }),
      ],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${ABS}: your edits no longer present`);
  });

  it('silently swallows user edit when file first appears with self + user contributors', () => {
    const previous = makeEnv([], []);
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          contributors: ['agent-1', 'user'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('does not report partial removal when baseline changes and hunks are reduced', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'old-base',
          currentOid: 'old-curr',
          hunkIds: ['h1', 'h2'],
          contributors: ['agent-1', 'user'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          baselineOid: 'new-base',
          currentOid: 'new-curr',
          hunkIds: ['h2'],
          contributors: ['agent-1', 'user'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });

  it('handles multiple files changing simultaneously', () => {
    const pathA = '/home/user/project/src/a.txt';
    const pathB = '/home/user/project/src/b.txt';
    const previous = makeEnv(
      [
        makeSnapshot({
          path: pathA,
          currentOid: 'a-old',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: pathA,
          currentOid: 'a-new',
          contributors: ['agent-1', 'user'],
        }),
        makeSnapshot({
          path: pathB,
          contributors: ['agent-42'],
        }),
      ],
      [],
    );
    const result = summaries(
      computeFileDiffChanges(previous, current, AGENT_ID),
    );
    expect(result).toContain(`${pathA} modified by: [user]`);
    expect(result).toContain(`${pathB} modified by: [agent-42]`);
    expect(result).toHaveLength(2);
  });

  it('does not report when a contributor is removed but self remains', () => {
    const previous = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'old-curr',
          contributors: ['agent-1', 'agent-42'],
        }),
      ],
      [],
    );
    const current = makeEnv(
      [
        makeSnapshot({
          path: ABS,
          currentOid: 'new-curr',
          contributors: ['agent-1'],
        }),
      ],
      [],
    );
    const result = computeFileDiffChanges(previous, current, AGENT_ID);
    expect(result).toEqual([]);
  });
});
