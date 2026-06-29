import type { AppState, MountEntry } from '@shared/karton-contracts/ui';
import { getBaseName, normalizePath } from '@shared/path-utils';

type FileTreeMountState = Pick<
  AppState,
  'contentTabs' | 'toolbox' | 'workspaceMounts'
>;

export function getFileTreeWorkspaceKey(mount: MountEntry): string {
  return `${mount.prefix}:${normalizePath(mount.path)}`;
}

/** Workspace prefixes that point to read-only, agent-internal mounts. */
const READONLY_WORKSPACE_PREFIXES = new Set(['att', 'plugins', 'apps']);

export function isReadOnlyWorkspaceKey(workspaceKey: string): boolean {
  const separatorIndex = workspaceKey.indexOf(':');
  if (separatorIndex <= 0) return false;
  const prefix = workspaceKey.slice(0, separatorIndex);
  return READONLY_WORKSPACE_PREFIXES.has(prefix);
}

export function getFileTreeWorkspaceName(mount: MountEntry): string {
  return getBaseName(mount.path) || mount.prefix;
}

export function getFileTreeWorkspaceMountsForAgent(
  state: FileTreeMountState,
  agentInstanceId: string | null,
): MountEntry[] {
  const mountsByKey = new Map<string, MountEntry>();
  const addMount = (mount: MountEntry) => {
    mountsByKey.set(getFileTreeWorkspaceKey(mount), mount);
  };

  if (agentInstanceId) {
    for (const mount of state.toolbox[agentInstanceId]?.workspace.mounts ??
      []) {
      addMount(mount);
    }
  }

  const activeTabId = state.contentTabs.activeTabId;
  const activeFile = activeTabId
    ? state.contentTabs.tabs[activeTabId]?.file
    : null;

  const activeTab = activeTabId ? state.contentTabs.tabs[activeTabId] : null;
  if (activeFile && activeTab?.agentInstanceId === null) {
    const globalFileMount = getAllFileTreeWorkspaceMounts(state).find(
      (mount) => getFileTreeWorkspaceKey(mount) === activeFile.workspaceKey,
    );
    if (globalFileMount) addMount(globalFileMount);
  }

  return Array.from(mountsByKey.values());
}

export function areFileTreeWorkspaceMountsEqual(
  a: MountEntry[],
  b: MountEntry[],
): boolean {
  return (
    a.length === b.length &&
    a.every((mount, index) => {
      const otherMount = b[index];
      return (
        otherMount !== undefined &&
        getFileTreeWorkspaceKey(mount) === getFileTreeWorkspaceKey(otherMount)
      );
    })
  );
}

export function getAllFileTreeWorkspaceMounts(
  state: FileTreeMountState,
): MountEntry[] {
  const mountsByKey = new Map<string, MountEntry>();

  for (const mount of state.workspaceMounts) {
    mountsByKey.set(getFileTreeWorkspaceKey(mount), mount);
  }

  for (const toolbox of Object.values(state.toolbox)) {
    for (const mount of toolbox.workspace.mounts) {
      mountsByKey.set(getFileTreeWorkspaceKey(mount), mount);
    }
  }

  return Array.from(mountsByKey.values());
}
