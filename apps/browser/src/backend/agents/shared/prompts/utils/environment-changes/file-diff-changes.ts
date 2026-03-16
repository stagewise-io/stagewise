import type {
  EnvironmentDiffSnapshot,
  FileDiffSnapshot,
} from '@shared/karton-contracts/ui/shared-types';
import type { EnvironmentChangeEntry } from './types';

type FileChange = {
  modifiers: string[];
  editsGone: boolean;
  editsPartiallyRemoved: boolean;
};

function formatContributor(
  contributor: string,
  agentInstanceId: string,
): string {
  if (contributor === `agent-${agentInstanceId}`) return 'you';
  if (contributor === 'user') return 'user';
  return contributor;
}

function buildSnapshotMap(
  snapshots: FileDiffSnapshot[],
): Map<string, FileDiffSnapshot> {
  const map = new Map<string, FileDiffSnapshot>();
  for (const s of snapshots) map.set(s.path, s);
  return map;
}

function getOrCreate(map: Map<string, FileChange>, path: string): FileChange {
  let entry = map.get(path);
  if (!entry) {
    entry = { modifiers: [], editsGone: false, editsPartiallyRemoved: false };
    map.set(path, entry);
  }
  return entry;
}

function newContributorsExcludingSelf(
  prevContributors: string[],
  currContributors: string[],
  selfKey: string,
): string[] {
  const prevSet = new Set(prevContributors);
  return currContributors.filter((c) => !prevSet.has(c) && c !== selfKey);
}

function formatFileChange(
  path: string,
  change: FileChange,
  agentInstanceId: string,
): EnvironmentChangeEntry | null {
  const hasModifiers = change.modifiers.length > 0;
  const formatted = change.modifiers.map((c) =>
    formatContributor(c, agentInstanceId),
  );

  let summary: string | null = null;
  if (hasModifiers && change.editsGone)
    summary = `${path} modified by: [${formatted.join(', ')}] (your edits no longer present)`;
  else if (hasModifiers && change.editsPartiallyRemoved)
    summary = `${path} modified by: [${formatted.join(', ')}] (some of your edits were removed)`;
  else if (hasModifiers)
    summary = `${path} modified by: [${formatted.join(', ')}]`;
  else if (change.editsGone) summary = `${path}: your edits no longer present`;
  else if (change.editsPartiallyRemoved)
    summary = `${path}: some of your edits were removed`;

  if (!summary) return null;
  return {
    type: 'file-diffs-changed',
    summary,
    attributes: { path },
  };
}

/**
 * Compares two environment diff snapshots and produces compact,
 * per-file change descriptions. Only reports modifications by others
 * and status changes to the agent's own pending edits.
 *
 * Never reports:
 * - "modified by you" (agent already knows about its own edits)
 * - "new pending edits" / "edits undone" (irrelevant to the agent)
 *
 * Distinguishes accept from reject by comparing the summary's
 * currentOid: if the summary still reflects the pending content,
 * the edits were accepted (not reported); otherwise they were
 * reverted (reported as "your edits no longer present").
 */
export function computeFileDiffChanges(
  previous: EnvironmentDiffSnapshot | null,
  current: EnvironmentDiffSnapshot,
  agentInstanceId: string,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  const selfKey = `agent-${agentInstanceId}`;
  const prevPending = buildSnapshotMap(previous.pending);
  const currPending = buildSnapshotMap(current.pending);
  const prevSummary = buildSnapshotMap(previous.summary);
  const currSummary = buildSnapshotMap(current.summary);

  const fileChanges = new Map<string, FileChange>();

  for (const [path, curr] of currPending) {
    if (prevPending.has(path)) continue;
    const entry = getOrCreate(fileChanges, path);
    const prevSummaryEntry = prevSummary.get(path);
    if (prevSummaryEntry) {
      entry.modifiers.push(
        ...newContributorsExcludingSelf(
          prevSummaryEntry.contributors,
          curr.contributors,
          selfKey,
        ),
      );
    } else {
      const others = curr.contributors.filter(
        (c) => c !== selfKey && c !== 'user',
      );
      if (others.length > 0) {
        entry.modifiers.push(...others);
      } else if (
        !curr.contributors.includes(selfKey) &&
        curr.contributors.includes('user')
      ) {
        entry.modifiers.push('user');
      }
    }
  }

  for (const [path, prev] of prevPending) {
    if (currPending.has(path)) continue;
    const selfWasContributor = prev.contributors.includes(selfKey);

    const summarySnap = currSummary.get(path);
    const editsStillReflectedInSummary =
      summarySnap != null && summarySnap.currentOid === prev.currentOid;

    // If the summary shows currentOid === baselineOid, the file was reverted
    // to baseline. If self was the only contributor in the previous pending
    // snapshot, this was a self-revert (agent undid its own changes) — not
    // an external revert. Don't report it.
    const selfRevertedToBaseline =
      selfWasContributor &&
      summarySnap != null &&
      summarySnap.currentOid === summarySnap.baselineOid &&
      prev.contributors.every((c) => c === selfKey);

    if (
      selfWasContributor &&
      !editsStillReflectedInSummary &&
      !selfRevertedToBaseline
    ) {
      const entry = getOrCreate(fileChanges, path);
      entry.editsGone = true;
    }
  }

  for (const [path, curr] of currPending) {
    const prev = prevPending.get(path);
    if (!prev) continue;

    const currentChanged = prev.currentOid !== curr.currentOid;
    if (!currentChanged) continue;

    const newModifiers = newContributorsExcludingSelf(
      prev.contributors,
      curr.contributors,
      selfKey,
    );

    // If no external contributors changed and self is still present,
    // this was a self-edit — skip entirely.
    const selfInCurr = curr.contributors.includes(selfKey);
    if (newModifiers.length === 0 && selfInCurr) continue;

    const entry = getOrCreate(fileChanges, path);
    const baselineChanged = prev.baselineOid !== curr.baselineOid;
    const hunksReduced = curr.hunkIds.length < prev.hunkIds.length;

    entry.modifiers.push(...newModifiers);

    const selfWasPrev = prev.contributors.includes(selfKey);
    if (selfWasPrev && !selfInCurr) {
      const summarySnap = currSummary.get(path);
      const editsStillReflected =
        summarySnap != null && summarySnap.currentOid === curr.currentOid;
      if (!editsStillReflected) entry.editsGone = true;
    } else if (!baselineChanged && hunksReduced && selfWasPrev) {
      entry.editsPartiallyRemoved = true;
    }
  }

  const changes: EnvironmentChangeEntry[] = [];
  for (const [path, change] of fileChanges) {
    const entry = formatFileChange(path, change, agentInstanceId);
    if (entry) changes.push(entry);
  }

  return changes;
}
