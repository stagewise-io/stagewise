import type { AgentStore, AgentSystemState } from '../../store';
import { ensureToolboxEntry } from '../../store';
import type { MountEntry } from '../../types/metadata';

/**
 * Atomic write for the `toolbox[agentId].workspace.mounts` slice.
 *
 * Sole writer for the migrated slice; callers (currently the core
 * `MountManager`) hand in a freshly-allocated `MountEntry[]` so the
 * bridge mirror's reference-identity diff fires on every change.
 * Wraps the mutation in a single `store.update(...)` to preserve the
 * one-`store.update`-per-intent transactional guarantee the bridge
 * mirror relies on.
 */
export function setAgentMounts(
  store: AgentStore,
  agentInstanceId: string,
  mounts: MountEntry[],
): void {
  store.update((draft) => {
    const entry = ensureToolboxEntry(
      draft as AgentSystemState,
      agentInstanceId,
    );
    entry.workspace = { mounts };
  });
}
