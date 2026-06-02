/**
 * Browser-host implementation of `HostEnvironmentSources`.
 *
 * Bridges the three host-side feeds required by the package-owned
 * environment providers:
 *
 * - `getResolvedSkillsForAgent` — projects `ToolboxService.getSkillsList`
 *   down to the minimal `ResolvedSkillEntry` shape.
 * - `getWorkspaceAgentSettings` — reads per-workspace agent settings
 *   from the Karton preferences tree, keyed by absolute workspace
 *   path so `AgentsMdProvider` can correlate with `MountManager`.
 * - `getGlobalSkillsMounts` — returns the static global-skills mount
 *   descriptors (`~/.stagewise/skills`, `~/.agents/skills`) with a
 *   live `exists` flag computed against disk.
 *
 * This adapter stays thin on purpose — the orchestrator invokes it on
 * every capture, so avoid any heavy caching or invalidation logic here.
 */
import { existsSync } from 'node:fs';
import type {
  HostEnvironmentSources,
  ResolvedSkillEntry,
  WorkspaceAgentSettingsEntry,
  GlobalSkillsMount,
} from '@stagewise/agent-core';
import type { KartonService } from '../services/karton';
import type { ToolboxService } from '../services/toolbox';
import { getGlobalSkillsMounts } from '../services/toolbox';

export interface BrowserHostEnvironmentSourcesDeps {
  karton: KartonService;
  toolbox: ToolboxService;
}

export function createBrowserHostEnvironmentSources(
  deps: BrowserHostEnvironmentSourcesDeps,
): HostEnvironmentSources {
  const { karton, toolbox } = deps;

  return {
    async getResolvedSkillsForAgent(
      agentInstanceId: string,
    ): Promise<ResolvedSkillEntry[]> {
      const skills = await toolbox.getSkillsList(agentInstanceId);
      return skills.map((s) => ({
        id: s.id,
        displayName: s.displayName,
        description: s.description,
        skillPath: s.skillPath,
        agentInvocable: s.agentInvocable,
      }));
    },

    getWorkspaceAgentSettings(
      agentInstanceId: string,
    ): Map<string, WorkspaceAgentSettingsEntry> {
      const mountManager = toolbox.getMountManager();
      const result = new Map<string, WorkspaceAgentSettingsEntry>();
      if (!mountManager) return result;

      const prefixes = mountManager.getMountPrefixes(agentInstanceId) ?? [];
      const workspaceSettings =
        karton.state.preferences?.agent?.workspaceSettings ?? {};

      for (const prefix of prefixes) {
        const wsPath = mountManager.getWorkspacePathForPrefix(prefix);
        if (!wsPath) continue;
        const entry = workspaceSettings[wsPath] ?? {
          respectAgentsMd: false,
          disabledSkills: [],
        };
        result.set(wsPath, {
          respectAgentsMd: entry.respectAgentsMd,
          disabledSkills: [...entry.disabledSkills],
        });
      }
      return result;
    },

    getGlobalSkillsMounts(): GlobalSkillsMount[] {
      return getGlobalSkillsMounts().map((m) => ({
        prefix: m.prefix,
        absolutePath: m.absolutePath,
        exists: existsSync(m.absolutePath),
      }));
    },
  };
}
