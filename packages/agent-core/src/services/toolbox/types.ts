import type { DiffHistoryService } from '../diff-history';
import type { HostPaths, Logger } from '../../host';
export type MountPermission = 'read' | 'write' | 'create' | 'delete';

export interface StaticMount {
  prefix: string;
  absolutePath: string;
  permissions: readonly MountPermission[];
}

export interface UniversalToolboxMountManager {
  getMountPrefixes(agentInstanceId: string): string[] | undefined;
  getWorkspacePathForPrefix(prefix: string): string | undefined;
  findWorkspaceForFile(
    agentInstanceId: string,
    filePath: string,
  ): string | undefined;
}

export interface UniversalToolboxMutationObserver {
  onTextFileWritten?: (
    agentInstanceId: string,
    absolutePath: string,
    content: string,
  ) => Promise<void> | void;
  onTextFileClosed?: (
    agentInstanceId: string,
    absolutePath: string,
  ) => Promise<void> | void;
}

export interface UniversalToolboxDeps {
  agentInstanceId: string;
  hostPaths: HostPaths;
  mountManager?: UniversalToolboxMountManager | null;
  staticMounts?: readonly StaticMount[];
  diffHistoryService?: DiffHistoryService | null;
  logger?: Logger;
  mutations?: UniversalToolboxMutationObserver;
  /**
   * Path passed to ClientRuntimeNode for ripgrep dispatch. When absent
   * or pointing at a missing binary, runtime-node silently falls back
   * to its minimatch + ignore JS path.
   */
  rgBinaryBasePath?: string;
}

export type MakeUniversalToolsDeps = UniversalToolboxDeps;
