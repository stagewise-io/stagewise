import type { ClientRuntimeNode } from '@stagewise/agent-runtime-node';
import {
  getSkills as getSkillsCore,
  type Skill,
} from '@stagewise/agent-core/mount-manager';

/**
 * Host-side `ClientRuntimeNode`-flavored adapter around the canonical
 * skill discovery helpers in `@stagewise/agent-core/mount-manager`.
 *
 * Pure re-exports (`parseFrontmatter`, `discoverSkills`,
 * `discoverGlobalSkills`, and `Skill`) keep existing imports stable;
 * `getSkills` resolves the runtime's working directory and delegates
 * to the core.
 */
export {
  parseFrontmatter,
  discoverSkills,
  discoverGlobalSkills,
} from '@stagewise/agent-core/mount-manager';
export type { Skill } from '@stagewise/agent-core/mount-manager';

export async function getSkills(
  clientRuntime: ClientRuntimeNode,
): Promise<Skill[]> {
  const cwd = clientRuntime.fileSystem.getCurrentWorkingDirectory();
  return getSkillsCore(cwd);
}
