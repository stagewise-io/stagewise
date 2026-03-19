import type { WorkspaceSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import type { EnvironmentChangeEntry } from './types';

/**
 * Compares two workspace snapshots and produces structured change
 * entries. Detects mounts added, removed, or changed.
 * Returns an empty array when there is no previous snapshot
 * (first message) or when nothing changed.
 */
export function computeWorkspaceChanges(
  previous: WorkspaceSnapshot | null,
  current: WorkspaceSnapshot,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  const changes: EnvironmentChangeEntry[] = [];

  const prevMap = new Map(previous.mounts.map((m) => [m.prefix, m]));
  const currMap = new Map(current.mounts.map((m) => [m.prefix, m]));

  for (const [prefix, mount] of currMap) {
    const prev = prevMap.get(prefix);
    if (!prev) {
      changes.push({
        type: 'workspace-mounted',
        attributes: { prefix, path: mount.path },
      });
    } else if (prev.path !== mount.path) {
      changes.push({
        type: 'workspace-path-changed',
        attributes: { prefix, from: prev.path, to: mount.path },
      });
    } else {
      const prevPerms = (prev.permissions ?? []).join(',');
      const currPerms = (mount.permissions ?? []).join(',');
      if (prevPerms !== currPerms) {
        changes.push({
          type: 'workspace-permissions-changed',
          attributes: {
            prefix,
            from: prevPerms,
            to: currPerms,
          },
        });
      }
    }
  }

  for (const [prefix, mount] of prevMap) {
    if (!currMap.has(prefix)) {
      changes.push({
        type: 'workspace-unmounted',
        attributes: { prefix, path: mount.path },
      });
    }
  }

  return changes;
}
