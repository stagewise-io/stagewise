import type { AgentStore } from '@stagewise/agent-core';
import type { AgentManagerToolboxPort } from '@stagewise/agent-core';
import type { MountPermission } from '@stagewise/agent-core/types/metadata';
import type { MountManager } from '@stagewise/agent-core/mount-manager';

export function createCliToolboxPort(deps: {
  mountManager: MountManager;
  store: AgentStore;
}): AgentManagerToolboxPort {
  const { mountManager, store } = deps;

  return {
    async handleMountWorkspace(
      agentInstanceId: string,
      workspacePath: string,
      _permissions?: MountPermission[],
    ) {
      await mountManager.mountWorkspace(agentInstanceId, workspacePath);
    },

    cancelQuestion() {},

    getWorkspaceSnapshotForPersistence(agentInstanceId: string) {
      const mounts =
        store.get().toolbox[agentInstanceId]?.workspace.mounts ?? [];
      return mounts.map((m: { path: string }) => ({
        path: m.path,
        permissions: [] as MountPermission[],
      }));
    },

    setWorkspaceMdContent() {},

    async acceptAllPendingEditsForAgent() {},

    async getEditedFilePathsForAgent() {
      return [];
    },
  };
}
