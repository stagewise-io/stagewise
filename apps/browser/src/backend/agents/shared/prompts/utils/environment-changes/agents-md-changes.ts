import type { AgentsMdSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { createPatch } from 'diff';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two AGENTS.md snapshots and produces structured change
 * entries. For content updates, includes a unified diff in `detail`.
 */
export function computeAgentsMdChanges(
  previous: AgentsMdSnapshot | null,
  current: AgentsMdSnapshot,
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
        type: 'agents-md-created',
        detail: currContent,
        attributes: { path: prefix },
      });
    } else if (prevContent !== currContent) {
      const diff = createPatch(
        `${prefix}/AGENTS.md`,
        prevContent,
        currContent,
        '',
        '',
        { context: 3 },
      );
      changes.push({
        type: 'agents-md-updated',
        detail: diff,
        attributes: { path: prefix },
      });
    }
  }

  for (const [prefix] of prevEntries) {
    if (!currEntries.has(prefix)) {
      changes.push({
        type: 'agents-md-deleted',
        attributes: { path: prefix },
      });
    }
  }

  const prevRespected = new Set(previous.respectedMounts);
  const currRespected = new Set(current.respectedMounts);

  for (const mount of currRespected) {
    if (!prevRespected.has(mount)) {
      changes.push({
        type: 'agents-md-enabled',
        attributes: { path: mount },
      });
    }
  }
  for (const mount of prevRespected) {
    if (!currRespected.has(mount)) {
      changes.push({
        type: 'agents-md-disabled',
        attributes: { path: mount },
      });
    }
  }

  return changes;
}
