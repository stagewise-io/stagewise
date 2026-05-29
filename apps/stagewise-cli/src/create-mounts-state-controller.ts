import type { AgentStore } from '@stagewise/agent-core';
import type { AgentSystemState } from '@stagewise/agent-core';
import { ensureToolboxEntry } from '@stagewise/agent-core/store';
import type { MountEntry } from '@stagewise/agent-core/types/metadata';
import type { MountsStateController } from '@stagewise/agent-core/mount-manager';

/**
 * Store-backed mounts controller (same contract as browser
 * `createMountsStateController`).
 */
export function createMountsStateController(
  store: AgentStore,
): MountsStateController {
  return {
    getMounts(agentInstanceId: string) {
      const entry = store.get().toolbox[agentInstanceId];
      return entry?.workspace.mounts ?? [];
    },

    setMounts(agentInstanceId: string, mounts: MountEntry[]) {
      store.update((draft: unknown) => {
        const entry = ensureToolboxEntry(
          draft as AgentSystemState,
          agentInstanceId,
        );
        entry.workspace = { mounts };
      });
    },
  };
}
