/**
 * Mount prefixes for global skill directories that are always enabled
 * (not gated by user preference). Stagewise and Agents dirs are core
 * to the product and always loaded when they exist on disk.
 */
export const ALWAYS_ENABLED_GLOBAL_SKILL_PREFIXES = new Set([
  'globalskills-sw',
  'globalskills-agents',
]);
