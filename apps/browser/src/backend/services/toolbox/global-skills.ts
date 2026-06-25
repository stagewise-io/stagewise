import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES } from '@shared/global-skill-prefixes';

/**
 * Return all known global skill mount descriptors (stagewise, agents,
 * codex, claude). This is the canonical list — every other consumer
 * derives from it.
 */
export function getGlobalSkillsMounts(): Array<{
  prefix: string;
  absolutePath: string;
}> {
  const home = homedir();
  return [
    {
      prefix: 'globalskills-sw',
      absolutePath: path.resolve(home, '.stagewise', 'skills'),
    },
    {
      prefix: 'globalskills-agents',
      absolutePath: path.resolve(home, '.agents', 'skills'),
    },
    {
      prefix: 'globalskills-codex',
      absolutePath: path.resolve(home, '.codex', 'skills'),
    },
    {
      prefix: 'globalskills-claude',
      absolutePath: path.resolve(home, '.claude', 'skills'),
    },
  ];
}

/**
 * Return the subset of global skill mounts the user has enabled.
 *
 * The built-in `globalskills-sw` and `globalskills-agents` mounts are
 * always enabled. External mounts (`globalskills-codex`,
 * `globalskills-claude`) are gated by the
 * `preferences.agent.enabledGlobalSkillDirs` opt-in list.
 *
 * Only mounts whose directory exists on disk are returned.
 */
export function getEnabledGlobalSkillsMounts(
  enabledGlobalSkillDirs: readonly string[],
): Array<{ prefix: string; absolutePath: string }> {
  const enabled = new Set(enabledGlobalSkillDirs);
  return getGlobalSkillsMounts().filter(
    (m) =>
      existsSync(m.absolutePath) &&
      (ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES.has(m.prefix) ||
        enabled.has(m.prefix)),
  );
}
