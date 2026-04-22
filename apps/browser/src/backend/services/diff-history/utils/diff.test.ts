import { describe, it, expect, beforeEach } from 'vitest';
import { structuredPatch } from 'diff';
import type { Operation, Contributor } from '../schema';
import type {
  TextFileDiff,
  ExternalFileDiff,
  BlamedHunk,
} from '@shared/karton-contracts/ui/shared-types';
import {
  segmentFileOperationsIntoGenerations,
  buildContributorMap,
  buildContributorMapIncremental,
  type ContributorMapState,
  createFileDiffsFromGenerations,
  acceptAndRejectHunks,
  isTextFileDiff,
  isExternalFileDiff,
  createFileDiffSnapshot,
  createEnvironmentDiffSnapshot,
} from './diff';

// =============================================================================
// Helper Types
// =============================================================================

type OperationWithContent = Operation & {
  snapshot_content: string;
  isExternal: boolean; // Required to match the actual type from diff.ts
};

// =============================================================================
// Helper Factories
// =============================================================================

let operationIdx = 0;

// Type for operation with isExternal flag (for segmentFileOperationsIntoGenerations tests)
type OperationWithExternal = Operation & { isExternal: boolean };

/**
 * Creates a mock baseline Operation
 * Note: Use explicit `snapshot_oid: null` to indicate deleted/non-existent file
 */
function createBaselineOp(overrides: {
  filepath?: string;
  snapshot_oid?: string | null;
  reason?: 'init' | 'accept';
  idx?: number;
}): Operation {
  return {
    idx: overrides.idx ?? operationIdx++,
    filepath: overrides.filepath ?? '/test/file.txt',
    operation: 'baseline',
    // Use 'in' check to distinguish between undefined and explicit null
    snapshot_oid:
      'snapshot_oid' in overrides
        ? overrides.snapshot_oid
        : `oid- ${Math.random().toString(36)}`,
    reason: overrides.reason ?? 'init',
    contributor: 'user',
  } as Operation;
}

/**
 * Creates a mock baseline Operation with isExternal flag
 */
function createBaselineOpWithExternal(
  overrides: {
    filepath?: string;
    snapshot_oid?: string | null;
    reason?: 'init' | 'accept';
    idx?: number;
  },
  isExternal = false,
): OperationWithExternal {
  return {
    ...createBaselineOp(overrides),
    isExternal,
  };
}

/**
 * Creates a mock edit Operation
 * Note: Use explicit `snapshot_oid: null` to indicate file deletion
 */
function createEditOp(overrides: {
  filepath?: string;
  snapshot_oid?: string | null;
  reason?: 'reject' | `tool-${string}`;
  contributor?: Contributor;
  idx?: number;
}): Operation {
  return {
    idx: overrides.idx ?? operationIdx++,
    filepath: overrides.filepath ?? '/test/file.txt',
    operation: 'edit',
    // Use 'in' check to distinguish between undefined and explicit null
    snapshot_oid:
      'snapshot_oid' in overrides
        ? overrides.snapshot_oid
        : `oid- ${Math.random().toString(36)}`,
    reason: overrides.reason ?? 'tool-123',
    contributor: overrides.contributor ?? 'agent-1',
  } as Operation;
}

/**
 * Creates a mock edit Operation with isExternal flag
 */
function createEditOpWithExternal(
  overrides: {
    filepath?: string;
    snapshot_oid?: string | null;
    reason?: 'reject' | `tool-${string}`;
    contributor?: Contributor;
    idx?: number;
  },
  isExternal = false,
): OperationWithExternal {
  return {
    ...createEditOp(overrides),
    isExternal,
  };
}

/**
 * Creates a mock OperationWithContent for buildContributorMap tests
 */
function createOpWithContent(
  op: Operation,
  content: string,
  isExternal = false,
): OperationWithContent {
  return {
    ...op,
    snapshot_content: content,
    isExternal,
  };
}

/**
 * Creates a TextFileDiff with realistic hunks from actual content diff
 */
function createFileDiffFromContent(
  fileId: string,
  path: string,
  baseline: string | null,
  current: string | null,
): TextFileDiff {
  const diffBaseline = baseline ?? '';
  const diffCurrent = current ?? '';
  const patch = structuredPatch('', '', diffBaseline, diffCurrent, '', '');
  const hunks: BlamedHunk[] = patch.hunks.map((hunk, i) => ({
    ...hunk,
    id: `hunk-${fileId}-${i}`,
    contributors: [],
  }));

  return {
    fileId,
    path,
    isExternal: false,
    baseline,
    current,
    baselineOid: baseline !== null ? `oid-baseline-${fileId}` : null,
    currentOid: current !== null ? `oid-current-${fileId}` : null,
    lineChanges: [],
    hunks,
  };
}

/**
 * Creates an ExternalFileDiff for testing external/binary file handling
 */
function createExternalFileDiff(
  fileId: string,
  path: string,
  changeType: 'created' | 'deleted' | 'modified',
  baselineOid: string | null,
  currentOid: string | null,
  contributor: Contributor = 'agent-1',
): ExternalFileDiff {
  return {
    fileId,
    path,
    isExternal: true,
    changeType,
    baselineOid,
    currentOid,
    contributor,
    hunkId: `ext-hunk-${fileId}`,
  };
}

/**
 * Creates a mock OperationWithContent for external files
 */
function createExternalOpWithContent(op: Operation): OperationWithContent {
  return {
    ...op,
    snapshot_content: '', // External files don't have text content
    isExternal: true,
  };
}

// =============================================================================
// Test Suites
// =============================================================================

describe('diff utilities', () => {
  // Reset operation index before each test
  beforeEach(() => {
    operationIdx = 0;
  });

  // ===========================================================================
  // segmentFileOperationsIntoGenerations
  // ===========================================================================

  describe('segmentFileOperationsIntoGenerations', () => {
    it('returns empty object for empty input', () => {
      const result = segmentFileOperationsIntoGenerations([]);
      expect(result).toEqual({});
    });

    it('returns one generation with one operation', () => {
      const op = createBaselineOpWithExternal({ filepath: '/readme.md' });
      const result = segmentFileOperationsIntoGenerations([op]);

      const generations = Object.values(result);
      expect(generations).toHaveLength(1);
      expect(generations[0]).toHaveLength(1);
      expect(generations[0][0]).toEqual(op);
    });

    it('keeps multiple ops without deletion in single generation', () => {
      const ops = [
        createBaselineOpWithExternal({
          filepath: '/readme.md',
          reason: 'init',
        }),
        createEditOpWithExternal({ filepath: '/readme.md', reason: 'tool-1' }),
        createEditOpWithExternal({ filepath: '/readme.md', reason: 'tool-2' }),
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      expect(generations).toHaveLength(1);
      expect(generations[0]).toHaveLength(3);
    });

    it('keeps delete-then-recreate in single generation', () => {
      const ops = [
        createBaselineOpWithExternal({
          filepath: '/readme.md',
          reason: 'init',
        }),
        createEditOpWithExternal({
          filepath: '/readme.md',
          reason: 'tool-1',
          snapshot_oid: null,
        }), // deletion
        createEditOpWithExternal({ filepath: '/readme.md', reason: 'tool-2' }), // recreation
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      expect(generations).toHaveLength(1);
      expect(generations[0]).toHaveLength(3);
    });

    it('keeps multiple delete-recreate cycles in single generation', () => {
      const ops = [
        createBaselineOpWithExternal({ filepath: '/readme.md' }),
        createEditOpWithExternal({
          filepath: '/readme.md',
          snapshot_oid: null,
        }), // delete
        createEditOpWithExternal({ filepath: '/readme.md' }), // create
        createEditOpWithExternal({
          filepath: '/readme.md',
          snapshot_oid: null,
        }), // delete again
        createEditOpWithExternal({ filepath: '/readme.md' }), // create again
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      expect(generations).toHaveLength(1);
      expect(generations[0]).toHaveLength(5);
    });

    it('treats init baseline with null oid as file creation (not deletion)', () => {
      // An init baseline with null oid means "file didn't exist at session start"
      // This is a file creation scenario, NOT a deletion
      // Only an EDIT with null oid triggers a new generation (file was deleted)
      const ops = [
        createBaselineOpWithExternal({
          filepath: '/readme.md',
          reason: 'init',
        }),
        createEditOpWithExternal({ filepath: '/readme.md' }),
        createBaselineOpWithExternal({
          filepath: '/readme.md',
          reason: 'init',
          snapshot_oid: null,
        }), // file didn't exist at new session start (file creation)
        createEditOpWithExternal({ filepath: '/readme.md' }), // creates the file
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      // All ops should be in a single generation since there's no deletion (edit with null oid)
      expect(generations).toHaveLength(1);
    });

    it('groups by filepath into one generation per filepath', () => {
      const ops = [
        createBaselineOpWithExternal({ filepath: '/file1.txt' }),
        createBaselineOpWithExternal({ filepath: '/file2.txt' }),
        createEditOpWithExternal({ filepath: '/file1.txt' }),
        createEditOpWithExternal({
          filepath: '/file2.txt',
          snapshot_oid: null,
        }), // delete file2
        createEditOpWithExternal({ filepath: '/file2.txt' }), // recreate file2
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      // file1: 1 generation (2 ops), file2: 1 generation (3 ops)
      expect(generations).toHaveLength(2);
      const file1Gen = generations.find((g) => g[0].filepath === '/file1.txt');
      const file2Gen = generations.find((g) => g[0].filepath === '/file2.txt');
      expect(file1Gen).toHaveLength(2);
      expect(file2Gen).toHaveLength(3);
    });

    it('handles deletion as last op without creating orphan generation', () => {
      const ops = [
        createBaselineOpWithExternal({ filepath: '/readme.md' }),
        createEditOpWithExternal({ filepath: '/readme.md' }),
        createEditOpWithExternal({
          filepath: '/readme.md',
          snapshot_oid: null,
        }), // deletion is last
      ];
      const result = segmentFileOperationsIntoGenerations(ops);

      const generations = Object.values(result);
      expect(generations).toHaveLength(1);
      expect(generations[0]).toHaveLength(3);
    });
  });

  // ===========================================================================
  // buildContributorMap
  // ===========================================================================

  describe('buildContributorMap', () => {
    it('returns empty map for empty generation', () => {
      const result = buildContributorMap({ 'file-1': [] });
      expect(result['file-1']).toEqual({ lineMap: {}, removalMap: {} });
    });

    it('attributes all baseline lines to user', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'line1\nline2\nline3',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap).toEqual({
        0: 'user',
        1: 'user',
        2: 'user',
      });
      expect(result['file-1'].removalMap).toEqual({});
    });

    it('attributes added lines to agent, unchanged to user', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(createBaselineOp({ reason: 'init' }), 'line1\n'),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1', reason: 'tool-1' }),
          'line1\nline2\n',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[0]).toBe('user');
      expect(result['file-1'].lineMap[1]).toBe('agent-1');
      expect(result['file-1'].removalMap).toEqual({});
    });

    it('tracks multiple agent edits with different contributors', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(createBaselineOp({ reason: 'init' }), 'line1\n'),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1', reason: 'tool-1' }),
          'line1\nline2\n',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-2', reason: 'tool-2' }),
          'line1\nline2\nline3\n',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[0]).toBe('user');
      expect(result['file-1'].lineMap[1]).toBe('agent-1');
      expect(result['file-1'].lineMap[2]).toBe('agent-2');
      expect(result['file-1'].removalMap).toEqual({});
    });

    it('attributes user reject edits to user', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(createBaselineOp({ reason: 'init' }), 'line1'),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1', reason: 'tool-1' }),
          'line1\nline2',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'user', reason: 'reject' }),
          'line1\nline2\nline3-user',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[2]).toBe('user');
    });

    it('treats subsequent init baseline as user edit (spec A)', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(createBaselineOp({ reason: 'init' }), 'original'),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1' }),
          'modified',
        ),
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'user-changed',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[0]).toBe('user');
    });

    it('handles generation starting with edit (no init)', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createEditOp({ contributor: 'agent-1', reason: 'tool-1' }),
          'new-content',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[0]).toBe('agent-1');
      expect(result['file-1'].removalMap).toEqual({});
    });

    it('handles mixed contributors modifying same lines', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'line1\nline2\nline3',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1' }),
          'line1\nmodified-by-A\nline3',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-2' }),
          'line1\nmodified-by-B\nline3',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap).toEqual({
        0: 'user',
        1: 'agent-2',
        2: 'user',
      });
      // baseline line 1 ("line2") was removed by agent-1; agent-2 only
      // removed agent-1's replacement (null origin), so removalMap is unchanged
      expect(result['file-1'].removalMap).toEqual({ 1: 'agent-1' });
    });

    it('does not include removed lines in final lineMap', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'line1\nline2\nline3',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1' }),
          'line1\nline3',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(Object.keys(result['file-1'].lineMap)).toHaveLength(2);
      expect(result['file-1'].lineMap).toEqual({
        0: 'user',
        1: 'user',
      });
      // baseline line 1 ("line2") was removed by agent-1
      expect(result['file-1'].removalMap).toEqual({ 1: 'agent-1' });
    });

    it('handles complete file replacement', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'old1\nold2\nold3',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1' }),
          'new1\nnew2',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap).toEqual({
        0: 'agent-1',
        1: 'agent-1',
      });
      expect(result['file-1'].removalMap).toEqual({
        0: 'agent-1',
        1: 'agent-1',
        2: 'agent-1',
      });
    });

    it('handles accept baseline at start of generation', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'accept' }),
          'accepted-line1\naccepted-line2\n',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1', reason: 'tool-1' }),
          'accepted-line1\naccepted-line2\nnew-line3\n',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap[0]).toBe('user');
      expect(result['file-1'].lineMap[1]).toBe('user');
      expect(result['file-1'].lineMap[2]).toBe('agent-1');
      expect(result['file-1'].removalMap).toEqual({});
    });

    it('tracks removal by correct contributor across multiple operations', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'lineA\nlineB\nlineC\n',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-1' }),
          'lineB\nlineC\n',
        ),
        createOpWithContent(
          createEditOp({ contributor: 'agent-2' }),
          'lineB\n',
        ),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap).toEqual({ 0: 'user', 1: 'user' });
      expect(result['file-1'].removalMap).toEqual({
        0: 'agent-1',
        2: 'agent-2',
      });
    });

    it('preserves original remover when line is re-added and removed again', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init' }),
          'keep\nremove-me\n',
        ),
        createOpWithContent(createEditOp({ contributor: 'agent-1' }), 'keep\n'),
        createOpWithContent(
          createEditOp({ contributor: 'agent-2' }),
          'keep\nremove-me\n',
        ),
        createOpWithContent(createEditOp({ contributor: 'agent-3' }), 'keep\n'),
      ];
      const result = buildContributorMap({ 'file-1': ops });

      expect(result['file-1'].lineMap).toEqual({ 0: 'user', 1: 'user' });
      // agent-1 removed baseline line 1 first; agent-2 re-added it (null origin);
      // agent-3 removed agent-2's line (null origin) — baseline line 1 stays
      // attributed to agent-1 (first and only removal of the original)
      expect(result['file-1'].removalMap).toEqual({ 1: 'agent-1' });
    });
  });

  // ===========================================================================
  // createFileDiffsFromGenerations
  // ===========================================================================

  describe('createFileDiffsFromGenerations', () => {
    it('skips empty generations', () => {
      const result = createFileDiffsFromGenerations({ 'file-1': [] }, {});
      expect(result).toHaveLength(0);
    });

    it('creates FileDiff with empty hunks when no changes', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'same content',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'same content',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks).toHaveLength(0);
        expect(diff.baseline).toBe('same content');
        expect(diff.current).toBe('same content');
      }
    });

    it('creates hunks for added lines', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'line1\nline2',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor, 1: 'agent-1' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks.length).toBeGreaterThan(0);
        expect(diff.baseline).toBe('line1');
        expect(diff.current).toBe('line1\nline2');
      }
    });

    it('creates hunks for removed lines with correct contributor', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1\nline2\n',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'line1\n',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor, 1: 'user' as Contributor },
          removalMap: { 1: 'agent-1' as Contributor },
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks.length).toBeGreaterThan(0);
        const removedChange = diff.lineChanges.find((lc) => lc.removed);
        expect(removedChange?.contributor).toBe('agent-1');
      }
    });

    it('handles multiple hunks for mixed changes', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1\nline2\nline3\nline4\nline5',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'modified1\nline2\nline3\nline4\nmodified5',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: {
            0: 'agent-1' as Contributor,
            1: 'user' as Contributor,
            2: 'user' as Contributor,
            3: 'user' as Contributor,
            4: 'agent-1' as Contributor,
          },
          removalMap: {
            0: 'agent-1' as Contributor,
            4: 'agent-1' as Contributor,
          },
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        // Should have hunks for the changes
        expect(diff.hunks.length).toBeGreaterThan(0);
      }
    });

    it('sets baseline to null for file creation (no init)', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createEditOp({ filepath: '/readme.md', reason: 'tool-1' }),
          'new file content',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'agent-1' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.baseline).toBeNull();
        expect(diff.current).toBe('new file content');
      }
    });

    it('sets current to null for file deletion', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'original content',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md', snapshot_oid: null }),
          '',
        ),
      ];
      // Override the last op to have null snapshot_oid
      ops[1].snapshot_oid = null;

      const contributorMap = {
        'file-1': { lineMap: {}, removalMap: {} },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.baseline).toBe('original content');
        expect(diff.current).toBeNull();
      }
    });

    it('includes contributor in lineChanges', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1',
        ),
        createOpWithContent(
          createEditOp({
            filepath: '/readme.md',
            contributor: 'agent-1',
          }),
          'line1\nline2',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor, 1: 'agent-1' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        // Check that lineChanges have contributors
        const addedChange = diff.lineChanges.find((lc) => lc.added);
        if (addedChange) {
          expect(addedChange.contributor).toBeDefined();
        }
      }
    });

    it('handles accept baseline at start of generation', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({
            reason: 'accept',
            filepath: '/readme.md',
            snapshot_oid: 'accept-oid',
          }),
          'accepted content',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md', contributor: 'agent-1' }),
          'accepted content\nnew line',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: {
            0: 'user' as Contributor,
            1: 'agent-1' as Contributor,
          },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.baseline).toBe('accepted content');
        expect(diff.current).toBe('accepted content\nnew line');
        expect(diff.hunks.length).toBeGreaterThan(0);
      }
    });

    it('populates hunk contributors from added line blame', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1\n',
        ),
        createOpWithContent(
          createEditOp({
            filepath: '/readme.md',
            contributor: 'agent-1',
          }),
          'line1\nline2\n',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor, 1: 'agent-1' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks.length).toBeGreaterThan(0);
        expect(diff.hunks[0].contributors).toEqual(['agent-1']);
      }
    });

    it('collects multiple contributors on a single hunk', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1\nline2\nline3',
        ),
        createOpWithContent(
          createEditOp({
            filepath: '/readme.md',
            contributor: 'agent-1',
          }),
          'modified1\nmodified2\nline3',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: {
            0: 'agent-1' as Contributor,
            1: 'user' as Contributor,
            2: 'user' as Contributor,
          },
          removalMap: {
            0: 'agent-1' as Contributor,
            1: 'agent-1' as Contributor,
          },
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks.length).toBeGreaterThan(0);
        const contributors = diff.hunks[0].contributors;
        expect(contributors).toContain('agent-1');
        expect(contributors).toContain('user');
        expect(contributors).toHaveLength(2);
      }
    });

    it('includes removal contributor in hunks with only removed lines', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'line1\nline2\n',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'line1\n',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor },
          removalMap: { 1: 'agent-1' as Contributor },
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );

      expect(result).toHaveLength(1);
      const diff = result[0];
      expect(isTextFileDiff(diff)).toBe(true);
      if (isTextFileDiff(diff)) {
        expect(diff.hunks.length).toBeGreaterThan(0);
        expect(diff.hunks[0].contributors).toEqual(['agent-1']);
      }
    });

    it('creates separate FileDiffs for multiple generations', () => {
      const ops1: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ reason: 'init', filepath: '/readme.md' }),
          'gen1 content',
        ),
      ];
      const ops2: OperationWithContent[] = [
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'gen2 content',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: { 0: 'user' as Contributor },
          removalMap: {},
        },
        'file-2': {
          lineMap: { 0: 'agent-1' as Contributor },
          removalMap: {},
        },
      };
      const result = createFileDiffsFromGenerations(
        { 'file-1': ops1, 'file-2': ops2 },
        contributorMap,
      );

      expect(result).toHaveLength(2);
      expect(result[0].fileId).not.toBe(result[1].fileId);
    });
  });

  // ===========================================================================
  // acceptAndRejectHunks
  // ===========================================================================

  describe('acceptAndRejectHunks', () => {
    it('returns empty result when no hunks to process', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const result = acceptAndRejectHunks([fileDiff], [], []);

      expect(Object.keys(result.result)).toHaveLength(0);
    });

    it('updates baseline when accepting a hunk', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) throw new Error('Expected hunk');

      const result = acceptAndRejectHunks([fileDiff], [hunkId], []);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        expect(fileResult.newBaseline).toBe('line1\nline2');
      }
    });

    it('updates current when rejecting a hunk', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) throw new Error('Expected hunk');

      const result = acceptAndRejectHunks([fileDiff], [], [hunkId]);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Rejecting should revert current to baseline
        expect(fileResult.newCurrent).toBe('line1');
      }
    });

    it('applies multiple accepted hunks', () => {
      // Create a diff with multiple hunks (changes at beginning and end)
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1\nline2\nline3\nline4\nline5',
        'modified1\nline2\nline3\nline4\nmodified5',
      );

      const hunkIds = fileDiff.hunks.map((h) => h.id);
      const result = acceptAndRejectHunks([fileDiff], hunkIds, []);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        expect(fileResult.newBaseline).toBe(
          'modified1\nline2\nline3\nline4\nmodified5',
        );
      }
    });

    it('applies multiple rejected hunks', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1\nline2\nline3\nline4\nline5',
        'modified1\nline2\nline3\nline4\nmodified5',
      );

      const hunkIds = fileDiff.hunks.map((h) => h.id);
      const result = acceptAndRejectHunks([fileDiff], [], hunkIds);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Should revert to baseline
        expect(fileResult.newCurrent).toBe('line1\nline2\nline3\nline4\nline5');
      }
    });

    it('handles accept and reject of different hunks', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1\nline2\nline3\nline4\nline5',
        'modified1\nline2\nline3\nline4\nmodified5',
      );

      if (fileDiff.hunks.length < 2) {
        // If only one hunk, skip this test case
        return;
      }

      const acceptId = fileDiff.hunks[0].id;
      const rejectId = fileDiff.hunks[1].id;
      const result = acceptAndRejectHunks([fileDiff], [acceptId], [rejectId]);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Should have both newBaseline and newCurrent
        expect(fileResult.newBaseline).toBeDefined();
        expect(fileResult.newCurrent).toBeDefined();
      }
    });

    it('accept wins when same hunk in both lists', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) throw new Error('Expected hunk');

      const result = acceptAndRejectHunks([fileDiff], [hunkId], [hunkId]);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Accept should win - baseline is updated, not current
        expect(fileResult.newBaseline).toBe('line1\nline2');
        expect(fileResult.newCurrent).toBeUndefined();
      }
    });

    it('later FileDiff overwrites earlier for same path', () => {
      const fileDiff1 = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'original',
        'version1',
      );
      const fileDiff2 = createFileDiffFromContent(
        'file-2',
        '/readme.md',
        'version1',
        'version2',
      );

      const hunkId1 = fileDiff1.hunks[0]?.id;
      const hunkId2 = fileDiff2.hunks[0]?.id;
      if (!hunkId1 || !hunkId2) throw new Error('Expected hunks');

      const result = acceptAndRejectHunks(
        [fileDiff1, fileDiff2],
        [hunkId1, hunkId2],
        [],
      );
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Later FileDiff's result should be the final one
        expect(fileResult.newBaseline).toBe('version2');
      }
    });

    it('handles null baseline (file creation)', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        null,
        'new file content',
      );
      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) throw new Error('Expected hunk');

      const result = acceptAndRejectHunks([fileDiff], [hunkId], []);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        expect(fileResult.newBaseline).toBe('new file content');
      }
    });

    it('handles null current (file deletion)', () => {
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'original content',
        null,
      );
      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) throw new Error('Expected hunk');

      const result = acceptAndRejectHunks([fileDiff], [hunkId], []);
      const fileResult = result.result['/readme.md'];

      expect(fileResult).toBeDefined();
      expect(fileResult?.isExternal).toBe(false);
      if (fileResult && !fileResult.isExternal) {
        // Accepting deletion means baseline becomes null (signals file deletion)
        // NOT empty string, which would create an empty file
        expect(fileResult.newBaseline).toBe(null);
      }
    });

    it('reports failed hunk IDs when patch cannot be applied', () => {
      // Create a real FileDiff from content, then modify baseline so patch won't apply
      const originalBaseline = 'line1\nline2\nline3\n';
      const current = 'line1\nmodified\nline3\n';

      // Create a proper FileDiff with real hunks
      const fileDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        originalBaseline,
        current,
      );

      // Now change the baseline so the hunk context won't match
      fileDiff.baseline = 'completely different content\n';

      const hunkId = fileDiff.hunks[0]?.id;
      if (!hunkId) {
        // If no hunk was created, the diff had no changes
        return;
      }

      const result = acceptAndRejectHunks([fileDiff], [hunkId], []);

      // Should report the failed hunk since context doesn't match modified baseline
      expect(result.failedAcceptedHunkIds).toContain(hunkId);
    });

    // =========================================================================
    // External File Tests
    // =========================================================================

    it('accepts external file hunk (oid swap)', () => {
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'modified',
        'baseline-oid-123',
        'current-oid-456',
      );

      const result = acceptAndRejectHunks(
        [externalDiff],
        [externalDiff.hunkId],
        [],
      );

      expect(result.result['/image.png']).toBeDefined();
      const fileResult = result.result['/image.png'];
      expect(fileResult.isExternal).toBe(true);
      if (fileResult.isExternal) {
        expect(fileResult.newBaselineOid).toBe('current-oid-456');
      }
    });

    it('rejects external file hunk (oid revert)', () => {
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'modified',
        'baseline-oid-123',
        'current-oid-456',
      );

      const result = acceptAndRejectHunks(
        [externalDiff],
        [],
        [externalDiff.hunkId],
      );

      expect(result.result['/image.png']).toBeDefined();
      const fileResult = result.result['/image.png'];
      expect(fileResult.isExternal).toBe(true);
      if (fileResult.isExternal) {
        expect(fileResult.newCurrentOid).toBe('baseline-oid-123');
      }
    });

    it('handles mixed text and external files', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'created',
        null,
        'new-oid-789',
      );

      const textHunkId = textDiff.hunks[0]?.id;
      if (!textHunkId) throw new Error('Expected text hunk');

      const result = acceptAndRejectHunks(
        [textDiff, externalDiff],
        [textHunkId, externalDiff.hunkId],
        [],
      );

      // Text file should have newBaseline content
      const textResult = result.result['/readme.md'];
      expect(textResult.isExternal).toBe(false);
      if (!textResult.isExternal) {
        expect(textResult.newBaseline).toBe('line1\nline2');
      }

      // External file should have newBaselineOid
      const extResult = result.result['/image.png'];
      expect(extResult.isExternal).toBe(true);
      if (extResult.isExternal) {
        expect(extResult.newBaselineOid).toBe('new-oid-789');
      }
    });

    it('skips external files with no matching hunkId', () => {
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'modified',
        'baseline-oid',
        'current-oid',
      );

      const result = acceptAndRejectHunks(
        [externalDiff],
        ['non-existent-hunk-id'],
        [],
      );

      expect(result.result['/image.png']).toBeUndefined();
    });

    it('accept wins for external file when hunkId in both lists', () => {
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'modified',
        'baseline-oid-123',
        'current-oid-456',
      );

      // Same hunkId in both accept and reject lists
      const result = acceptAndRejectHunks(
        [externalDiff],
        [externalDiff.hunkId],
        [externalDiff.hunkId],
      );

      const fileResult = result.result['/image.png'];
      expect(fileResult.isExternal).toBe(true);
      if (fileResult.isExternal) {
        // Accept wins: baseline adopts current
        expect(fileResult.newBaselineOid).toBe('current-oid-456');
        // Reject should not have been processed
        expect(fileResult.newCurrentOid).toBeUndefined();
      }
    });
  });

  // ===========================================================================
  // createFileDiffsFromGenerations - External Files
  // ===========================================================================

  describe('createFileDiffsFromGenerations - external files', () => {
    it('creates ExternalFileDiff for generation with external operations', () => {
      const ops: OperationWithContent[] = [
        createExternalOpWithContent(
          createBaselineOp({
            filepath: '/image.png',
            reason: 'init',
            snapshot_oid: 'baseline-oid',
          }),
        ),
        createExternalOpWithContent(
          createEditOp({
            filepath: '/image.png',
            snapshot_oid: 'current-oid',
            contributor: 'agent-1',
          }),
        ),
      ];

      const result = createFileDiffsFromGenerations({ 'file-1': ops }, {});

      expect(result).toHaveLength(1);
      expect(isExternalFileDiff(result[0])).toBe(true);
      if (isExternalFileDiff(result[0])) {
        expect(result[0].isExternal).toBe(true);
        expect(result[0].changeType).toBe('modified');
        expect(result[0].baselineOid).toBe('baseline-oid');
        expect(result[0].currentOid).toBe('current-oid');
        expect(result[0].contributor).toBe('agent-1');
      }
    });

    it('determines changeType as created for external file', () => {
      const ops: OperationWithContent[] = [
        createExternalOpWithContent(
          createEditOp({
            filepath: '/new-image.png',
            snapshot_oid: 'new-oid',
            contributor: 'agent-1',
            reason: 'tool-1',
          }),
        ),
      ];

      const result = createFileDiffsFromGenerations({ 'file-1': ops }, {});

      expect(result).toHaveLength(1);
      if (isExternalFileDiff(result[0])) {
        expect(result[0].changeType).toBe('created');
        expect(result[0].baselineOid).toBeNull();
        expect(result[0].currentOid).toBe('new-oid');
      }
    });

    it('determines changeType as deleted for external file', () => {
      const ops: OperationWithContent[] = [
        createExternalOpWithContent(
          createBaselineOp({
            filepath: '/image.png',
            reason: 'init',
            snapshot_oid: 'original-oid',
          }),
        ),
        createExternalOpWithContent(
          createEditOp({
            filepath: '/image.png',
            snapshot_oid: null,
            contributor: 'agent-1',
          }),
        ),
      ];

      const result = createFileDiffsFromGenerations({ 'file-1': ops }, {});

      expect(result).toHaveLength(1);
      if (isExternalFileDiff(result[0])) {
        expect(result[0].changeType).toBe('deleted');
        expect(result[0].baselineOid).toBe('original-oid');
        expect(result[0].currentOid).toBeNull();
      }
    });

    it('handles accept baseline for external file', () => {
      const ops: OperationWithContent[] = [
        createExternalOpWithContent(
          createBaselineOp({
            filepath: '/image.png',
            reason: 'accept',
            snapshot_oid: 'accepted-oid',
          }),
        ),
        createExternalOpWithContent(
          createEditOp({
            filepath: '/image.png',
            snapshot_oid: 'new-edit-oid',
            contributor: 'agent-1',
          }),
        ),
      ];

      const result = createFileDiffsFromGenerations({ 'file-1': ops }, {});

      expect(result).toHaveLength(1);
      expect(isExternalFileDiff(result[0])).toBe(true);
      if (isExternalFileDiff(result[0])) {
        expect(result[0].changeType).toBe('modified');
        expect(result[0].baselineOid).toBe('accepted-oid');
        expect(result[0].currentOid).toBe('new-edit-oid');
      }
    });

    it('creates TextFileDiff for generation without external flag', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ filepath: '/readme.md', reason: 'init' }),
          'text content',
        ),
        createOpWithContent(
          createEditOp({ filepath: '/readme.md' }),
          'modified text content',
        ),
      ];

      const result = createFileDiffsFromGenerations(
        { 'file-1': ops },
        {
          'file-1': {
            lineMap: { 0: 'user' as Contributor },
            removalMap: {},
          },
        },
      );

      expect(result).toHaveLength(1);
      expect(isTextFileDiff(result[0])).toBe(true);
      if (isTextFileDiff(result[0])) {
        expect(result[0].isExternal).toBe(false);
        expect(result[0].baseline).toBe('text content');
        expect(result[0].current).toBe('modified text content');
      }
    });

    it('handles mixed text and external generations', () => {
      const textOps: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({ filepath: '/readme.md', reason: 'init' }),
          'text',
        ),
      ];
      const externalOps: OperationWithContent[] = [
        createExternalOpWithContent(
          createBaselineOp({
            filepath: '/image.png',
            reason: 'init',
            snapshot_oid: 'img-oid',
          }),
        ),
      ];

      const result = createFileDiffsFromGenerations(
        { 'file-1': textOps, 'file-2': externalOps },
        {
          'file-1': {
            lineMap: { 0: 'user' as Contributor },
            removalMap: {},
          },
        },
      );

      expect(result).toHaveLength(2);

      const textDiff = result.find((d) => d.path === '/readme.md');
      const externalDiff = result.find((d) => d.path === '/image.png');

      expect(textDiff).toBeDefined();
      expect(externalDiff).toBeDefined();
      expect(isTextFileDiff(textDiff!)).toBe(true);
      expect(isExternalFileDiff(externalDiff!)).toBe(true);
    });
  });

  // ===========================================================================
  // Type Guards
  // ===========================================================================

  describe('type guards', () => {
    it('isTextFileDiff correctly identifies text files', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'content',
        'content',
      );
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'created',
        null,
        'oid',
      );

      expect(isTextFileDiff(textDiff)).toBe(true);
      expect(isTextFileDiff(externalDiff)).toBe(false);
    });

    it('isExternalFileDiff correctly identifies external files', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'content',
        'content',
      );
      const externalDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'created',
        null,
        'oid',
      );

      expect(isExternalFileDiff(textDiff)).toBe(false);
      expect(isExternalFileDiff(externalDiff)).toBe(true);
    });
  });

  // ===========================================================================
  // createFileDiffSnapshot / createEnvironmentDiffSnapshot
  // ===========================================================================

  describe('createFileDiffSnapshot', () => {
    it('extracts OIDs from text file diff', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'line1',
        'line1\nline2',
      );
      const snapshot = createFileDiffSnapshot(textDiff);

      expect(snapshot.path).toBe('/readme.md');
      expect(snapshot.fileId).toBe('file-1');
      expect(snapshot.isExternal).toBe(false);
      expect(snapshot.baselineOid).toBe('oid-baseline-file-1');
      expect(snapshot.currentOid).toBe('oid-current-file-1');
    });

    it('extracts OIDs from external file diff', () => {
      const extDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'modified',
        'baseline-oid-abc',
        'current-oid-def',
        'agent-1',
      );
      const snapshot = createFileDiffSnapshot(extDiff);

      expect(snapshot.path).toBe('/image.png');
      expect(snapshot.fileId).toBe('ext-1');
      expect(snapshot.isExternal).toBe(true);
      expect(snapshot.baselineOid).toBe('baseline-oid-abc');
      expect(snapshot.currentOid).toBe('current-oid-def');
      expect(snapshot.hunkIds).toEqual(['ext-hunk-ext-1']);
      expect(snapshot.contributors).toEqual(['agent-1']);
    });

    it('collects hunk IDs and unique contributors from text diff', () => {
      const ops: OperationWithContent[] = [
        createOpWithContent(
          createBaselineOp({
            reason: 'init',
            filepath: '/readme.md',
            snapshot_oid: 'oid-base',
          }),
          'line1\n',
        ),
        createOpWithContent(
          createEditOp({
            filepath: '/readme.md',
            contributor: 'agent-1',
            snapshot_oid: 'oid-edit',
          }),
          'line1\nline2\n',
        ),
      ];
      const contributorMap = {
        'file-1': {
          lineMap: {
            0: 'user' as Contributor,
            1: 'agent-1' as Contributor,
          },
          removalMap: {},
        },
      };
      const diffs = createFileDiffsFromGenerations(
        { 'file-1': ops },
        contributorMap,
      );
      expect(diffs).toHaveLength(1);

      const snapshot = createFileDiffSnapshot(diffs[0]);
      expect(snapshot.hunkIds.length).toBeGreaterThan(0);
      expect(snapshot.contributors).toEqual(['agent-1']);
    });

    it('handles null OIDs for file creation', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/new-file.txt',
        null,
        'new content',
      );
      const snapshot = createFileDiffSnapshot(textDiff);

      expect(snapshot.baselineOid).toBeNull();
      expect(snapshot.currentOid).toBe('oid-current-file-1');
    });

    it('handles null OIDs for file deletion', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/deleted.txt',
        'old content',
        null,
      );
      const snapshot = createFileDiffSnapshot(textDiff);

      expect(snapshot.baselineOid).toBe('oid-baseline-file-1');
      expect(snapshot.currentOid).toBeNull();
    });
  });

  describe('createEnvironmentDiffSnapshot', () => {
    it('maps pending and summary arrays to snapshots', () => {
      const textDiff = createFileDiffFromContent(
        'file-1',
        '/readme.md',
        'a',
        'b',
      );
      const extDiff = createExternalFileDiff(
        'ext-1',
        '/image.png',
        'created',
        null,
        'oid-123',
      );
      const result = createEnvironmentDiffSnapshot(
        [textDiff],
        [textDiff, extDiff],
      );

      expect(result.pending).toHaveLength(1);
      expect(result.pending[0].path).toBe('/readme.md');
      expect(result.summary).toHaveLength(2);
      expect(result.summary[0].path).toBe('/readme.md');
      expect(result.summary[1].path).toBe('/image.png');
    });
  });
});

// =============================================================================
// buildContributorMapIncremental: equivalence with full build across split
// points. Verifies that caching + replay produces identical ContributorMaps.
// =============================================================================

describe('buildContributorMapIncremental', () => {
  beforeEach(() => {
    operationIdx = 1;
  });

  /**
   * Generates a deterministic sequence of operations for one filepath.
   * Mixes baseline, agent edits, user edits, additions, deletions, and
   * content restorations.
   */
  function buildSequence(): OperationWithContent[] {
    const fp = '/src/file.ts';
    const ops: OperationWithContent[] = [];
    const push = (op: Operation, content: string) =>
      ops.push(createOpWithContent(op, content));

    // 0: baseline with 5 lines
    push(
      createBaselineOp({ filepath: fp, reason: 'init' }),
      'line1\nline2\nline3\nline4\nline5',
    );
    // 1: agent-1 appends line6
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-1',
        reason: 'tool-a',
      }),
      'line1\nline2\nline3\nline4\nline5\nline6',
    );
    // 2: agent-2 removes line3
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-2',
        reason: 'tool-b',
      }),
      'line1\nline2\nline4\nline5\nline6',
    );
    // 3: user edits line1 -> new content (reject reason ~ user-save analogue)
    push(
      createEditOp({
        filepath: fp,
        contributor: 'user',
        reason: 'reject',
      }),
      'LINE-ONE\nline2\nline4\nline5\nline6',
    );
    // 4: agent-1 inserts line7 at the end
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-1',
        reason: 'tool-c',
      }),
      'LINE-ONE\nline2\nline4\nline5\nline6\nline7',
    );
    // 5: agent-1 deletes the entire file (snapshot_oid: null, content '')
    push(
      createEditOp({
        filepath: fp,
        snapshot_oid: null,
        contributor: 'agent-1',
        reason: 'tool-d',
      }),
      '',
    );
    // 6: agent-2 recreates with single line
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-2',
        reason: 'tool-e',
      }),
      'only-line',
    );
    // 7: agent-2 extends to two lines
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-2',
        reason: 'tool-f',
      }),
      'only-line\nsecond-line',
    );
    // 8: user modifies second-line
    push(
      createEditOp({
        filepath: fp,
        contributor: 'user',
        reason: 'reject',
      }),
      'only-line\nSECOND-LINE-EDITED',
    );
    // 9: agent-1 adds third-line
    push(
      createEditOp({
        filepath: fp,
        contributor: 'agent-1',
        reason: 'tool-g',
      }),
      'only-line\nSECOND-LINE-EDITED\nthird-line',
    );

    return ops;
  }

  it('matches buildContributorMap when invoked from-scratch (no prior state)', () => {
    const ops = buildSequence();
    const fileId = 'file-a';
    const full = buildContributorMap({ [fileId]: ops });
    const { maps } = buildContributorMapIncremental(ops, null, null);
    expect(maps).toEqual(full[fileId]);
  });

  it('matches full build for every possible split point', () => {
    const ops = buildSequence();
    const fileId = 'file-a';
    const fullMaps = buildContributorMap({ [fileId]: ops })[fileId];

    for (let split = 0; split < ops.length; split++) {
      const firstHalf = ops.slice(0, split + 1);
      const secondHalf = ops;

      // First pass: seed cache with ops up to and including `split`.
      const first = buildContributorMapIncremental(firstHalf, null, null);
      expect(first.finalLatestOpIdx).toBe(Number(ops[split].idx));

      // Second pass: replay the full sequence on top of the cached state.
      // The incremental function must skip ops already included in the
      // priorState and apply only the tail (idx > priorStateLatestOpIdx).
      const priorClone: ContributorMapState = structuredClone(first.finalState);
      const second = buildContributorMapIncremental(
        secondHalf,
        priorClone,
        first.finalLatestOpIdx,
      );

      expect(second.maps).toEqual(fullMaps);
      expect(second.finalLatestOpIdx).toBe(Number(ops[ops.length - 1].idx));
    }
  });

  it('handles deletion (snapshot_oid null -> empty content) correctly', () => {
    const ops = buildSequence();
    const fileId = 'file-a';
    const fullMaps = buildContributorMap({ [fileId]: ops })[fileId];

    // Split right before the deletion op (index 5).
    const firstHalf = ops.slice(0, 5);
    const secondHalf = ops;

    const first = buildContributorMapIncremental(firstHalf, null, null);
    const second = buildContributorMapIncremental(
      secondHalf,
      structuredClone(first.finalState),
      first.finalLatestOpIdx,
    );

    expect(second.maps).toEqual(fullMaps);
  });

  it('returns empty maps when given no operations and no prior state', () => {
    const result = buildContributorMapIncremental([], null, null);
    expect(result.maps).toEqual({ lineMap: {}, removalMap: {} });
    expect(result.finalLatestOpIdx).toBe(-1);
  });

  it('noop when all provided ops are already included in the prior state', () => {
    const ops = buildSequence();
    const first = buildContributorMapIncremental(ops.slice(0, 4), null, null);
    // Re-feed the exact same ops: they should be skipped entirely and the
    // state should remain unchanged.
    const second = buildContributorMapIncremental(
      ops.slice(0, 4),
      structuredClone(first.finalState),
      first.finalLatestOpIdx,
    );
    expect(second.maps).toEqual(
      buildContributorMap({ 'file-a': ops.slice(0, 4) })['file-a'],
    );
    expect(second.finalLatestOpIdx).toBe(first.finalLatestOpIdx);
  });
});
