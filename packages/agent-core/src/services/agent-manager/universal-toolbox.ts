import type { Tool } from 'ai';
import type { BaseAgentToolboxView } from '../../agents/base-agent';
import type { AgentHost } from '../../host/host';
import type { MountPermission } from '../../types/metadata';
import type { SkillDefinition } from '../../types/skills';
import type { AttachmentMetadata } from '../../types/metadata';
import { makeUniversalTools } from '../toolbox';
import type { MountManager } from '../mount-manager/mount-registry';

export interface CreateUniversalToolboxDeps {
  host: AgentHost;
  mountManager: MountManager;
  /**
   * Optional path to the directory holding the ripgrep binary used by
   * runtime-node for the universal file tools. When omitted (or pointing
   * at a missing binary), runtime-node transparently falls back to its
   * minimatch + ignore JS implementation.
   */
  rgBinaryBasePath?: string;
}

/**
 * Headless {@link BaseAgentToolboxView} for thin Node hosts: universal
 * file tools + mount wiring + empty environment capture. Browser hosts
 * should keep using {@link ToolboxService}.
 */
export function createUniversalToolbox(
  deps: CreateUniversalToolboxDeps,
): BaseAgentToolboxView {
  const universalToolNames = new Set([
    'read',
    'ls',
    'mkdir',
    'write',
    'multiEdit',
    'delete',
    'copy',
    'glob',
    'grepSearch',
  ]);

  return {
    async getTool(
      toolName: string,
      agentInstanceId: string,
    ): Promise<Tool | null> {
      if (!universalToolNames.has(toolName)) return null;
      const partial = makeUniversalTools({
        agentInstanceId,
        hostPaths: deps.host.paths,
        mountManager: deps.mountManager,
        logger: deps.host.logger,
        rgBinaryBasePath: deps.rgBinaryBasePath,
      });
      const t = partial[toolName as keyof typeof partial];
      return (t ?? null) as Tool | null;
    },

    async handleMountWorkspace(
      agentInstanceId: string,
      workspacePath: string,
      _permissions?: MountPermission[],
    ): Promise<void> {
      await deps.mountManager.mountWorkspace(agentInstanceId, workspacePath);
    },

    getMountedPathsForAgent(agentInstanceId: string): Map<string, string> {
      const map = new Map<string, string>();
      const prefixes = deps.mountManager.getMountPrefixes(agentInstanceId);
      if (!prefixes) return map;
      for (const prefix of prefixes) {
        const abs = deps.mountManager.getWorkspacePathForPrefix(prefix);
        if (abs) map.set(prefix, abs);
      }
      return map;
    },

    async getWorkspaceMd(agentInstanceId: string) {
      const read = deps.host.readWorkspaceMdFromDisk;
      if (!read) return [];
      const prefixes = deps.mountManager.getMountPrefixes(agentInstanceId);
      if (!prefixes) return [];
      const out: Array<{
        mountPrefix: string;
        path: string;
        content: string;
      }> = [];
      for (const prefix of prefixes) {
        const workspacePath =
          deps.mountManager.getWorkspacePathForPrefix(prefix);
        if (!workspacePath) continue;
        const content = (await read(workspacePath)) ?? '';
        out.push({ mountPrefix: prefix, path: workspacePath, content });
      }
      return out;
    },

    async undoToolCalls(
      _toolCallIds: string[],
      _agentInstanceId: string,
    ): Promise<void> {},

    drainPendingAttachments(_agentInstanceId: string): AttachmentMetadata[] {
      return [];
    },

    cancelPendingAgentDialogs(_agentInstanceId: string): void {},

    clearAgentTracking(_agentInstanceId: string): void {},

    async getSkillsList(_agentInstanceId: string): Promise<SkillDefinition[]> {
      return [];
    },
  };
}
