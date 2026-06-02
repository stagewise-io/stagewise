/**
 * `fileDiffs` core {@link DomainAdapter}.
 *
 * Tracks the pending-diff manifest for the agent (`toolbox.pendingFileDiffs`
 * and `toolbox.editSummary`, projected to {@link EnvironmentDiffSnapshot}
 * by `createEnvironmentDiffSnapshot`). Unlike most adapters, this one
 * has NO full-state render — pending diffs are conveyed to the model
 * via dedicated tool outputs, not the system-prompt keyframe. Only the
 * delta render fires, reporting external modifications and pending-edit
 * status changes per file.
 */
import { createEnvironmentDiffSnapshot } from '../../services/diff-history/utils/diff';
import type { AgentStore } from '../../store/agent-store';
import type {
  EnvironmentDiffSnapshot,
  FileDiffSnapshot,
} from '../../types/diff-history';
import type { DomainAdapter } from '../contract';
import {
  CORE_ENV_SCHEMA_VERSION,
  type EnvironmentChangeEntry,
  renderChangesXml,
} from './shared';
import FileDiffsPromptSection from './file-diffs.prompt.md?raw';

export interface FileDiffsDomainAdapterDeps {
  store: AgentStore;
  renderOrder?: number;
}

function buildFileDiffsState(
  agentInstanceId: string,
  store: AgentStore,
): EnvironmentDiffSnapshot {
  const toolboxState = store.get().toolbox[agentInstanceId];
  if (!toolboxState) return { pending: [], summary: [] };
  return createEnvironmentDiffSnapshot(
    toolboxState.pendingFileDiffs,
    toolboxState.editSummary,
  );
}

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
  const hasSignal =
    hasModifiers || change.editsGone || change.editsPartiallyRemoved;
  if (!hasSignal) return null;
  const attrs: Record<string, string> = { path };
  if (hasModifiers) {
    attrs.changedBy = change.modifiers
      .map((c) => formatContributor(c, agentInstanceId))
      .join(',');
  }
  if (change.editsGone) attrs.editsGone = 'true';
  if (change.editsPartiallyRemoved) attrs.editsPartiallyRemoved = 'true';
  return { type: 'file-diffs-changed', attributes: attrs };
}

function computeFileDiffChanges(
  previous: EnvironmentDiffSnapshot,
  current: EnvironmentDiffSnapshot,
  agentInstanceId: string,
): EnvironmentChangeEntry[] {
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

/** Stable env-domain id for the file-diffs adapter. */
export const FILE_DIFFS_DOMAIN_ID = 'fileDiffs';

export function createFileDiffsDomainAdapter(
  deps: FileDiffsDomainAdapterDeps,
): DomainAdapter<EnvironmentDiffSnapshot> {
  // The diff computation needs the `agentInstanceId` to format
  // contributor labels ("you" vs. "user" vs. external agent). We
  // capture it during `getState` and read it in the sync
  // `renderState`. Multiple agents share one adapter instance via the
  // registry, but `captureAll` calls `getState` immediately before
  // `renderState` per agent so this scoping is safe.
  let lastAgentId: string | null = null;
  return {
    domainId: FILE_DIFFS_DOMAIN_ID,
    renderOrder: deps.renderOrder ?? 12,
    schemaVersion: CORE_ENV_SCHEMA_VERSION,
    promptSection: FileDiffsPromptSection,
    getState(agentInstanceId) {
      lastAgentId = agentInstanceId;
      return buildFileDiffsState(agentInstanceId, deps.store);
    },
    renderState(prev, curr) {
      if (prev === null) return '';
      const agentId = lastAgentId ?? '';
      return renderChangesXml(computeFileDiffChanges(prev, curr, agentId));
    },
  };
}
