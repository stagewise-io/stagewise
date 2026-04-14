import type { FullEnvironmentSnapshot } from '@shared/karton-contracts/ui/agent/metadata';
import { computeAgentsMdChanges } from './agents-md-changes';
import { computeAppChanges } from './app-changes';
import { computeBrowserChanges } from './browser-changes';
import { computeFileDiffChanges } from './file-diff-changes';
import { computePlansChanges } from './plans-changes';
import { computeSandboxChanges } from './sandbox-changes';
import { computeShellChanges } from './shell-changes';
import { computeSkillsChanges } from './skills-changes';
import type { EnvironmentChangeEntry } from './types';
import { computeWorkspaceChanges } from './workspace-changes';
import { computeWorkspaceMdChanges } from './workspace-md-changes';

export { computeAgentsMdChanges } from './agents-md-changes';
export { computeAppChanges } from './app-changes';
export { computeBrowserChanges } from './browser-changes';
export { computeFileDiffChanges } from './file-diff-changes';
export { computePlansChanges } from './plans-changes';
export { computeSandboxChanges } from './sandbox-changes';
export { computeShellChanges } from './shell-changes';
export { computeSkillsChanges } from './skills-changes';
export { computeWorkspaceChanges } from './workspace-changes';
export { computeWorkspaceMdChanges } from './workspace-md-changes';
export {
  resolveEffectiveSnapshot,
  sparsifySnapshot,
} from './resolve-snapshot';
export type { EnvironmentChangeEntry } from './types';
export { renderEnvironmentChangesXml } from './types';

/**
 * Compares two fully-resolved environment snapshots and returns all
 * structured change entries across every domain.
 *
 * Returns an empty array when `previous` is null (first message)
 * or when nothing changed.
 */
export function computeAllEnvironmentChanges(
  previous: FullEnvironmentSnapshot | null,
  current: FullEnvironmentSnapshot,
  agentInstanceId: string,
): EnvironmentChangeEntry[] {
  if (!previous) return [];

  return [
    ...computeSandboxChanges(
      previous.sandboxSessionId,
      current.sandboxSessionId,
    ),
    ...computeShellChanges(previous.shells, current.shells),
    ...computeBrowserChanges(
      previous.browser,
      current.browser,
      previous.browserSessionId,
      current.browserSessionId,
    ),
    ...computeWorkspaceChanges(previous.workspace, current.workspace),
    ...computeFileDiffChanges(
      previous.fileDiffs,
      current.fileDiffs,
      agentInstanceId,
    ),
    ...computeAppChanges(previous.activeApp, current.activeApp),
    ...computeAgentsMdChanges(previous.agentsMd, current.agentsMd),
    ...computeWorkspaceMdChanges(previous.workspaceMd, current.workspaceMd),
    ...computeSkillsChanges(previous.enabledSkills, current.enabledSkills),
    ...computePlansChanges(previous.plans, current.plans),
  ];
}
