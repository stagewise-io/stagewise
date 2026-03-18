import { randomUUID, createHash } from 'node:crypto';

/**
 * Generates a deterministic hunk ID based on content and position.
 * This ensures the same hunk produces the same ID across multiple calls.
 */
function generateDeterministicHunkId(
  filepath: string,
  oldStart: number,
  oldLines: number,
  newStart: number,
  newLines: number,
  content: string,
): string {
  const hash = createHash('sha256');
  hash.update(
    `${filepath}:${oldStart}:${oldLines}:${newStart}:${newLines}:${content}`,
  );
  return hash.digest('hex').slice(0, 32);
}
import {
  diffLines,
  structuredPatch,
  formatPatch,
  reversePatch,
  applyPatch,
} from 'diff';
import type { Contributor } from '../schema';
import type {
  FileDiff,
  TextFileDiff,
  ExternalFileDiff,
  BlamedLineChange,
  BlamedHunk,
  FileResult,
  ExternalFileResult,
  FileDiffSnapshot,
  EnvironmentDiffSnapshot,
} from '@shared/karton-contracts/ui/shared-types';
import type { OperationWithExternal } from './db';

/**
 * Type guard to check if a FileDiff is a TextFileDiff
 */
export function isTextFileDiff(diff: FileDiff): diff is TextFileDiff {
  return diff.isExternal === false;
}

/**
 * Type guard to check if a FileDiff is an ExternalFileDiff
 */
export function isExternalFileDiff(diff: FileDiff): diff is ExternalFileDiff {
  return diff.isExternal === true;
}

type FileId = string;
/**
 * Groups operations by filepath, assigning a single unique fileId per filepath.
 *
 * Delete-then-recreate sequences are kept in the same group so that the
 * resulting diff shows "modified" rather than separate "deleted" + "created"
 * entries. The downstream diff functions handle null snapshot_oid (deletion)
 * naturally by treating the content as an empty string.
 *
 * This function is defensive: it groups operations by filepath first, even
 * though it typically receives operations for a single filepath.
 *
 * @param operations - Ordered operations (should be for a single filepath, but handles multiple defensively)
 * @returns Record of fileId to operations, one entry per unique filepath
 */
export function segmentFileOperationsIntoGenerations<
  T extends OperationWithExternal | OperationWithContent,
>(operations: T[]): Record<FileId, T[]> {
  if (operations.length === 0) return {};

  // Group operations by filepath — one fileId per filepath
  const opsByFilepath: Record<string, T[]> = {};
  for (const op of operations) {
    const existing = opsByFilepath[op.filepath] ?? [];
    existing.push(op);
    opsByFilepath[op.filepath] = existing;
  }

  const result: Record<FileId, T[]> = {};
  for (const fileOps of Object.values(opsByFilepath)) {
    result[randomUUID()] = fileOps;
  }

  return result;
}

export type OperationWithContent = OperationWithExternal & {
  snapshot_content: string | null;
};

export type ContributorMaps = {
  lineMap: { [lineNumber: number]: Contributor };
  removalMap: { [baselineLineNumber: number]: Contributor };
};

/**
 * Builds a contributor map for each generation, showing which contributor
 * is responsible for each line in the final content, and which contributor
 * removed each baseline line that no longer survives.
 *
 * Algorithm:
 * 1. If generation starts with a baseline, use its content as the baseline
 * 2. If generation doesn't start with a baseline, baseline is empty string
 * 3. Process remaining operations sequentially:
 *    - For baselines: attribute added lines to 'user' (per spec A: session boundaries)
 *    - For edits: attribute added lines to the edit's contributor
 * 4. For snapshot_oid=null, treat content as empty string (all lines removed)
 * 5. Track each line's original baseline position; when a baseline-originating
 *    line is removed, record the contributor who removed it in `removalMap`.
 *
 * @param generations - Record of fileId to operations with resolved snapshot content
 * @returns Record of fileId to { lineMap, removalMap }
 */
export function buildContributorMap(
  generations: Record<FileId, OperationWithContent[]>,
): Record<FileId, ContributorMaps> {
  const result: Record<FileId, ContributorMaps> = {};

  for (const fileId of Object.keys(generations)) {
    const operations = generations[fileId];
    if (operations.length === 0) {
      result[fileId] = { lineMap: {}, removalMap: {} };
      continue;
    }

    let lineContributors: Contributor[] = [];
    let lineBaselineOrigin: (number | null)[] = [];
    const removalMap: { [baselineLineNumber: number]: Contributor } = {};
    let previousContent = '';

    const firstOp = operations[0];
    const startsWithBaseline = firstOp.operation === 'baseline';

    let startIndex = 0;
    if (startsWithBaseline) {
      previousContent = firstOp.snapshot_content ?? '';
      const baselineLines = previousContent
        ? previousContent.split('\n').length
        : 0;
      lineContributors = Array(baselineLines).fill('user' as Contributor);
      lineBaselineOrigin = Array.from({ length: baselineLines }, (_, i) => i);
      startIndex = 1;
    }

    for (let i = startIndex; i < operations.length; i++) {
      const op = operations[i];
      const currentContent = op.snapshot_content ?? '';

      const contributor: Contributor =
        op.operation === 'baseline' ? 'user' : op.contributor;

      const diffResults = diffLines(previousContent, currentContent, {
        oneChangePerToken: true,
      });

      let lineIndex = 0;
      for (const diffResult of diffResults) {
        if (diffResult.added) {
          const lineCount =
            diffResult.count ?? diffResult.value.split('\n').length;
          const contributorsToAdd = Array(lineCount).fill(contributor);
          const originsToAdd: (number | null)[] = Array(lineCount).fill(null);
          lineContributors.splice(lineIndex, 0, ...contributorsToAdd);
          lineBaselineOrigin.splice(lineIndex, 0, ...originsToAdd);
          lineIndex += lineCount;
        } else if (diffResult.removed) {
          const lineCount = diffResult.count ?? 0;
          for (let j = 0; j < lineCount; j++) {
            const origin = lineBaselineOrigin[lineIndex + j];
            if (origin !== null) {
              removalMap[origin] = contributor;
            }
          }
          lineContributors.splice(lineIndex, lineCount);
          lineBaselineOrigin.splice(lineIndex, lineCount);
        } else {
          const lineCount = diffResult.count ?? 0;
          lineIndex += lineCount;
        }
      }

      previousContent = currentContent;
    }

    const lineMap: { [lineNumber: number]: Contributor } = {};
    for (let i = 0; i < lineContributors.length; i++)
      lineMap[i] = lineContributors[i];

    result[fileId] = { lineMap, removalMap };
  }

  return result;
}

/**
 * Helper type for hunk range tracking
 */
type HunkRange = {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  hunkId: string;
};

/**
 * Finds the hunk ID for a given line position.
 * For added lines, checks if the new line position falls within a hunk's new range.
 * For removed lines, checks if the old line position falls within a hunk's old range.
 *
 * @param hunkRanges - Array of hunk ranges with their IDs
 * @param oldLine - Current position in old content (1-indexed)
 * @param newLine - Current position in new content (1-indexed)
 * @param isAdded - Whether this is an added line (true) or removed line (false)
 * @returns The hunk ID if found, null otherwise
 */
function findHunkId(
  hunkRanges: HunkRange[],
  oldLine: number,
  newLine: number,
  isAdded: boolean | undefined,
): string | null {
  for (const range of hunkRanges) {
    if (isAdded && newLine >= range.newStart && newLine <= range.newEnd)
      return range.hunkId;
    else if (oldLine >= range.oldStart && oldLine <= range.oldEnd)
      return range.hunkId;
  }
  return null;
}

/**
 * Determines the change type for an external file based on baseline and current state.
 */
function determineExternalChangeType(
  firstOp: OperationWithContent,
  lastOp: OperationWithContent,
): 'created' | 'deleted' | 'modified' {
  const hasBaseline =
    firstOp.operation === 'baseline' && firstOp.snapshot_oid !== null;
  const hasCurrent = lastOp.snapshot_oid !== null;

  if (!hasBaseline && hasCurrent) return 'created';
  if (hasBaseline && !hasCurrent) return 'deleted';
  return 'modified';
}

/**
 * Creates FileDiff objects from generations and their contributor maps.
 * Uses diffLines for full file diff (lineChanges) and structuredPatch for hunks.
 * For external files, creates ExternalFileDiff with a single atomic hunk.
 *
 * @param generations - Record of fileId to operations with resolved snapshot content
 * @param contributorMap - Record of fileId to { lineMap, removalMap }
 * @returns Array of FileDiff objects, one per generation
 */
export function createFileDiffsFromGenerations(
  generations: Record<FileId, OperationWithContent[]>,
  contributorMap: Record<FileId, ContributorMaps>,
): FileDiff[] {
  const result: FileDiff[] = [];

  for (const fileId of Object.keys(generations)) {
    const operations = generations[fileId];
    if (operations.length === 0) continue;

    const firstOp = operations[0];
    const lastOp = operations[operations.length - 1];
    const path = firstOp.filepath;

    // Check if this is an external file generation
    const isExternalGeneration = operations.some((op) => op.isExternal);

    if (isExternalGeneration) {
      const startsWithBaseline = firstOp.operation === 'baseline';
      const changeType = determineExternalChangeType(firstOp, lastOp);

      result.push({
        fileId,
        path,
        isExternal: true,
        changeType,
        baselineOid: startsWithBaseline ? firstOp.snapshot_oid : null,
        currentOid: lastOp.snapshot_oid,
        contributor: lastOp.contributor,
        hunkId: generateDeterministicHunkId(
          path,
          0,
          0,
          0,
          0,
          `${startsWithBaseline ? firstOp.snapshot_oid : 'null'}:${lastOp.snapshot_oid}`,
        ),
      });
      continue;
    }

    const startsWithBaseline = firstOp.operation === 'baseline';
    const baseline: string | null = startsWithBaseline
      ? firstOp.snapshot_oid === null
        ? null
        : (firstOp.snapshot_content ?? '')
      : null;

    // Determine current: null if file was deleted, otherwise content
    const current: string | null =
      lastOp.snapshot_oid === null ? null : (lastOp.snapshot_content ?? '');

    // For diffing, convert null to '' (diff functions expect strings)
    const diffBaseline = baseline ?? '';
    const diffCurrent = current ?? '';

    // Step 3: Generate hunks with IDs using structuredPatch
    const patch = structuredPatch('', '', diffBaseline, diffCurrent, '', '');
    const hunksWithoutContributors = patch.hunks.map((hunk) => ({
      ...hunk,
      id: generateDeterministicHunkId(
        path,
        hunk.oldStart,
        hunk.oldLines,
        hunk.newStart,
        hunk.newLines,
        hunk.lines.join('\n'),
      ),
    }));

    // Build hunk ranges for lookup
    const hunkRanges: HunkRange[] = hunksWithoutContributors.map((h) => ({
      oldStart: h.oldStart,
      oldEnd: h.oldStart + h.oldLines - 1,
      newStart: h.newStart,
      newEnd: h.newStart + h.newLines - 1,
      hunkId: h.id,
    }));

    // Step 4: Get full diff using diffLines
    const changes = diffLines(diffBaseline, diffCurrent, {
      oneChangePerToken: true,
    });

    // Step 5 & 6: Walk through changes, assign hunkIds and contributors
    let oldLine = 1; // 1-indexed to match structuredPatch
    let newLine = 1;
    const lineChanges: BlamedLineChange[] = [];
    const maps = contributorMap[fileId] ?? { lineMap: {}, removalMap: {} };
    const fileLineMap = maps.lineMap;
    const fileRemovalMap = maps.removalMap;
    const hunkContributorSets = new Map<string, Set<Contributor>>();

    for (const change of changes) {
      const lineCount = change.count ?? 0;
      let hunkId: string | null = null;

      if (change.added || change.removed) {
        hunkId = findHunkId(hunkRanges, oldLine, newLine, change.added);
      }

      // Removed lines: look up who removed this baseline line via removalMap
      // Added/unchanged lines: look up from lineMap using new content line number
      const contributor: Contributor = change.removed
        ? (fileRemovalMap[oldLine - 1] ?? 'user')
        : (fileLineMap[newLine - 1] ?? 'user');

      if (hunkId && (change.added || change.removed)) {
        const set = hunkContributorSets.get(hunkId) ?? new Set();
        set.add(contributor);
        hunkContributorSets.set(hunkId, set);
      }

      lineChanges.push({
        ...change,
        hunkId,
        contributor,
      });

      if (!change.added) oldLine += lineCount;
      if (!change.removed) newLine += lineCount;
    }

    // Step 7: Attach contributors to hunks and assemble TextFileDiff
    const hunks: BlamedHunk[] = hunksWithoutContributors.map((h) => ({
      ...h,
      contributors: [...(hunkContributorSets.get(h.id) ?? [])],
    }));

    result.push({
      fileId,
      path,
      isExternal: false,
      baseline,
      current,
      baselineOid: startsWithBaseline ? firstOp.snapshot_oid : null,
      currentOid: lastOp.snapshot_oid,
      lineChanges,
      hunks,
    });
  }

  return result;
}

type FilePath = string;
/**
 * Accepts and rejects hunks for each file in the fileDiffs and return the new baseline and current for each file.
 * Accepted hunks will move the baseline closer to the current and rejected hunks will move the current closer to the baseline.
 *
 * For text files: applies patches to compute new content.
 * For external files: returns oid swaps (accept = baseline adopts current oid, reject = current reverts to baseline oid).
 *
 * Hunks will be accepted/ rejected in order of the fileDiffs first, and then by the order of the hunkIdsToAccept and hunkIdsToReject. If the same ID is accepted and rejected, the hunk will be accepted.
 * If accepted hunks of different generations (file-ids) modify the same file-path, the latest accept/ reject will win.
 * - example:
 *   - FileDiff 1 with hunkId '1' deletes readme.md
 *   - FileDiff 2 with hunkId '2' creates readme.md with content 'Hello, world!'
 *   - acceptedHunkIds: ['1', '2']
 *   - result: { '/readme.md': { isExternal: false, newBaseline: 'Hello, world!' } }
 *
 */
export function acceptAndRejectHunks(
  fileDiffs: FileDiff[],
  hunkIdsToAccept: string[],
  hunkIdsToReject: string[],
): {
  result: Record<FilePath, FileResult>;
  failedAcceptedHunkIds?: string[];
  failedRejectedHunkIds?: string[];
} {
  // Step 1: Build accept/reject sets with precedence (accept wins)
  const acceptSet = new Set(hunkIdsToAccept);
  const rejectSet = new Set(hunkIdsToReject.filter((id) => !acceptSet.has(id)));

  // Result tracking
  const pathResults: Record<FilePath, FileResult> = {};
  const failedAcceptedHunkIds: string[] = [];
  const failedRejectedHunkIds: string[] = [];

  // Process each FileDiff in order
  for (const fileDiff of fileDiffs) {
    // Handle external files (binary/large files)
    if (isExternalFileDiff(fileDiff)) {
      const shouldAccept = acceptSet.has(fileDiff.hunkId);
      const shouldReject = rejectSet.has(fileDiff.hunkId);

      if (!shouldAccept && !shouldReject) continue;

      // For external files, accept = baseline adopts current, reject = current reverts to baseline
      const existingResult = pathResults[fileDiff.path];
      const isExistingExternal =
        existingResult && 'isExternal' in existingResult
          ? existingResult.isExternal
          : false;

      if (shouldAccept) {
        pathResults[fileDiff.path] = {
          isExternal: true,
          ...(isExistingExternal ? (existingResult as ExternalFileResult) : {}),
          newBaselineOid: fileDiff.currentOid,
        };
      }
      if (shouldReject) {
        pathResults[fileDiff.path] = {
          isExternal: true,
          ...(isExistingExternal ? (existingResult as ExternalFileResult) : {}),
          newCurrentOid: fileDiff.baselineOid,
        };
      }
      continue; // Skip text processing
    }

    // Handle text files (existing logic)
    const textFileDiff = fileDiff; // Type narrowed to TextFileDiff

    // Get hunks to accept/reject for this FileDiff, preserving original order
    const hunksToAccept = textFileDiff.hunks.filter((h) => acceptSet.has(h.id));
    const hunksToReject = textFileDiff.hunks.filter((h) => rejectSet.has(h.id));

    // Skip if no hunks to process for this FileDiff
    if (hunksToAccept.length === 0 && hunksToReject.length === 0) continue;

    // Get working copies of baseline/current (convert null to '' for diffing)
    const diffBaseline = textFileDiff.baseline ?? '';
    const diffCurrent = textFileDiff.current ?? '';

    // Track whether we've modified baseline/current
    let workingBaseline: string | null = textFileDiff.baseline;
    let workingCurrent: string | null = textFileDiff.current;
    let baselineChanged = false;
    let currentChanged = false;

    // Apply accepts (batch with fallback)
    if (hunksToAccept.length > 0) {
      // Build patch structure for accepted hunks
      const basePatch = structuredPatch(
        '',
        '',
        diffBaseline,
        diffCurrent,
        '',
        '',
      );
      const acceptPatch = { ...basePatch, hunks: hunksToAccept };
      const patchString = formatPatch(acceptPatch);

      // Try batch apply first
      const workingBaselineStr = workingBaseline ?? '';
      const result = applyPatch(workingBaselineStr, patchString);

      if (result !== false) {
        workingBaseline = result;
        baselineChanged = true;
      } else {
        // Fallback: apply one-by-one to identify failures
        let currentWorkingBaseline = workingBaselineStr;
        for (const hunk of hunksToAccept) {
          const singlePatch = { ...basePatch, hunks: [hunk] };
          const singlePatchString = formatPatch(singlePatch);
          const singleResult = applyPatch(
            currentWorkingBaseline,
            singlePatchString,
          );

          if (singleResult !== false) {
            currentWorkingBaseline = singleResult;
            baselineChanged = true;
          } else failedAcceptedHunkIds.push(hunk.id);
        }
        workingBaseline = currentWorkingBaseline;
      }
    }

    // Apply rejects (batch with fallback)
    if (hunksToReject.length > 0) {
      // Build reversed patch structure for rejected hunks
      const basePatch = structuredPatch(
        '',
        '',
        diffBaseline,
        diffCurrent,
        '',
        '',
      );
      const rejectPatch = { ...basePatch, hunks: hunksToReject };
      const reversedPatch = reversePatch(rejectPatch);
      const patchString = formatPatch(reversedPatch);

      // Try batch apply first
      const workingCurrentStr = workingCurrent ?? '';
      const result = applyPatch(workingCurrentStr, patchString);

      if (result !== false) {
        workingCurrent = result;
        currentChanged = true;
      } else {
        // Fallback: apply one-by-one to identify failures
        let currentWorkingCurrent = workingCurrentStr;
        for (const hunk of hunksToReject) {
          const singlePatch = { ...basePatch, hunks: [hunk] };
          const reversedSingle = reversePatch(singlePatch);
          const singlePatchString = formatPatch(reversedSingle);
          const singleResult = applyPatch(
            currentWorkingCurrent,
            singlePatchString,
          );

          if (singleResult !== false) {
            currentWorkingCurrent = singleResult;
            currentChanged = true;
          } else {
            failedRejectedHunkIds.push(hunk.id);
          }
        }
        workingCurrent = currentWorkingCurrent;
      }
    }

    // Handle file creation revert: if baseline was null and we reverted to '',
    // convert back to null to indicate the file should be deleted
    if (textFileDiff.baseline === null && workingCurrent === '')
      workingCurrent = null;

    // Handle file deletion revert: if current was null and we reverted baseline to '',
    // the file should be restored from the original baseline
    if (textFileDiff.current === null && workingBaseline === '')
      workingBaseline = null;

    // Store results per filepath (later FileDiffs overwrite earlier)
    if (baselineChanged || currentChanged) {
      pathResults[fileDiff.path] = {
        isExternal: false,
        ...(baselineChanged && { newBaseline: workingBaseline }),
        ...(currentChanged && { newCurrent: workingCurrent }),
      };
    }
  }

  // Build final result with optional failure arrays
  const finalResult: Record<FilePath, FileResult> & {
    failedAcceptedHunkIds?: string[];
    failedRejectedHunkIds?: string[];
  } = {
    ...pathResults,
  };

  return { result: finalResult, failedAcceptedHunkIds, failedRejectedHunkIds };
}

/**
 * Creates a lightweight snapshot from a FileDiff, extracting only the
 * fingerprints needed for change detection (no full file content).
 */
export function createFileDiffSnapshot(diff: FileDiff): FileDiffSnapshot {
  if (isExternalFileDiff(diff)) {
    return {
      path: diff.path,
      fileId: diff.fileId,
      isExternal: true,
      baselineOid: diff.baselineOid,
      currentOid: diff.currentOid,
      hunkIds: [diff.hunkId],
      contributors: [diff.contributor],
    };
  }

  const uniqueContributors = [
    ...new Set(
      diff.lineChanges
        .filter((lc) => lc.added || lc.removed)
        .map((lc) => lc.contributor),
    ),
  ];

  return {
    path: diff.path,
    fileId: diff.fileId,
    isExternal: false,
    baselineOid: diff.baselineOid,
    currentOid: diff.currentOid,
    hunkIds: diff.hunks.map((h) => h.id),
    contributors: uniqueContributors,
  };
}

/**
 * Creates a full environment diff snapshot from pending and summary
 * FileDiff arrays. This is the lightweight representation stored
 * per-message for change detection between agent turns.
 */
export function createEnvironmentDiffSnapshot(
  pending: FileDiff[],
  summary: FileDiff[],
): EnvironmentDiffSnapshot {
  return {
    pending: pending.map(createFileDiffSnapshot),
    summary: summary.map(createFileDiffSnapshot),
  };
}
