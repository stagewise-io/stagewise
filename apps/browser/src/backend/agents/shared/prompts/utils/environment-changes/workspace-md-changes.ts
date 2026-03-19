import type { WorkspaceMdSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { createPatch } from 'diff';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two WORKSPACE.md snapshots and produces structured change
 * entries. For content updates, includes a unified diff in `detail`.
 */
export function computeWorkspaceMdChanges(
  previous: WorkspaceMdSnapshot | null,
  current: WorkspaceMdSnapshot,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  const changes: EnvironmentChangeEntry[] = [];

  const prevEntries = new Map(
    previous.entries.map((e) => [e.mountPrefix, e.content]),
  );
  const currEntries = new Map(
    current.entries.map((e) => [e.mountPrefix, e.content]),
  );

  for (const [prefix, currContent] of currEntries) {
    const prevContent = prevEntries.get(prefix);
    if (prevContent === undefined) {
      changes.push({
        type: 'workspace-md-created',
        detail: currContent,
        attributes: { path: prefix },
      });
    } else if (prevContent !== currContent) {
      const diff = createPatch(
        `${prefix}/WORKSPACE.md`,
        prevContent,
        currContent,
        '',
        '',
        { context: 3 },
      );
      changes.push({
        type: 'workspace-md-updated',
        detail: diff,
        attributes: { path: prefix },
      });
    }
  }

  for (const [prefix] of prevEntries) {
    if (!currEntries.has(prefix)) {
      changes.push({
        type: 'workspace-md-deleted',
        attributes: { path: prefix },
      });
    }
  }

  return changes;
}
