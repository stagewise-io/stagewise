export const EXTERNAL_GLOBAL_SKILL_SOURCES = [
  {
    prefix: 'globalskills-codex',
    label: 'Codex',
    directory: '~/.codex/skills',
  },
  {
    prefix: 'globalskills-claude',
    label: 'Claude Code',
    directory: '~/.claude/skills',
  },
] as const;

export type ExternalGlobalSkillSourcePrefix =
  (typeof EXTERNAL_GLOBAL_SKILL_SOURCES)[number]['prefix'];

export const GLOBAL_SKILL_SOURCES = [
  {
    prefix: 'globalskills-sw',
    label: 'Stagewise',
    directory: '~/.stagewise/skills',
  },
  {
    prefix: 'globalskills-agents',
    label: 'Agents',
    directory: '~/.agents/skills',
  },
  ...EXTERNAL_GLOBAL_SKILL_SOURCES,
] as const;

/**
 * Mount prefixes for global skill directories that are always enabled
 * (not gated by user preference). Stagewise and Agents dirs are core
 * to the product and always loaded when they exist on disk.
 */
export const ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES = new Set([
  'globalskills-sw',
  'globalskills-agents',
]);
