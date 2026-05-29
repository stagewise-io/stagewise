import type {
  AgentStore,
  AgentSystemState,
  MountEntry,
} from '@stagewise/agent-core';
import { ensureToolboxEntry } from './ensure-toolbox-entry';

/**
 * Host surface that owns the migrated `toolbox[agentId].workspace.mounts`
 * slice.
 *
 * Phase 3b moves canonical ownership of `workspace.mounts` from Karton to
 * `AgentStore`. `MountManagerService` is the sole writer and dispatches
 * through this controller instead of calling `uiKarton.setState`. The
 * `AgentCoreBridge` mirrors the rebuilt array back into Karton for every
 * existing reader (pages-state-sync, toolbox env-snapshot, mention
 * search, the UI mount selector).
 *
 * Contract notes:
 *   - Writes are whole-array replacement: the service always allocates a
 *     fresh array (and a fresh `MountEntry` object when per-field data
 *     inside an entry changes). The bridge mirror dedups on reference
 *     identity, so passing the same array reference again is a no-op.
 *   - `workspace` is always replaced as a whole object on write so Karton
 *     subscribers observe a clean reference change on the `workspace`
 *     slice itself.
 *   - This is the sole host surface for the migrated `workspace.mounts`
 *     slice; no other writer is permitted.
 */
export interface MountsStateController {
  /**
   * Atomic write for the per-agent mounts array. Callers must always
   * allocate a fresh array (and fresh entry objects for per-field
   * updates) so downstream reference-identity diffs correctly detect
   * state changes.
   */
  setMounts(agentInstanceId: string, mounts: MountEntry[]): void;

  /**
   * Read-only peek for services that want to observe their own writes.
   * Returns an empty array when the toolbox entry for `agentInstanceId`
   * does not exist yet.
   */
  getMounts(agentInstanceId: string): MountEntry[];
}

/**
 * Builds a `MountsStateController` backed by the given `AgentStore`.
 *
 * Writes are wrapped in a single `store.update()` so subscribers observe
 * one post-recipe state per call (D18 transactional guarantee).
 */
export function createMountsStateController(
  store: AgentStore,
): MountsStateController {
  return {
    getMounts(agentInstanceId) {
      const entry = store.get().toolbox[agentInstanceId];
      return entry?.workspace.mounts ?? [];
    },

    setMounts(agentInstanceId, mounts) {
      store.update((draft) => {
        const entry = ensureToolboxEntry(
          draft as AgentSystemState,
          agentInstanceId,
        );
        entry.workspace = { mounts };
      });
    },
  };
}
