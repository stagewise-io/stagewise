/**
 * Shared definitions for worktree setup scripts.
 *
 * Two script variants are supported:
 * - `posix`      -> `.stagewise/worktree-setup.sh` (executed via `/bin/sh`)
 * - `powershell` -> `.stagewise/worktree-setup.ps1` (executed via PowerShell)
 *
 * The variant that actually runs is determined by the host platform
 * (see `variantForPlatform`). The settings UI lets users author both.
 *
 * NOTE: relative paths use forward slashes so this module stays safe to import
 * from the renderer (no `node:path` dependency). Backend consumers join these
 * with `path.join`, which normalizes separators per platform.
 */

export type WorktreeSetupScriptVariant = 'posix' | 'powershell';

export const WORKTREE_SETUP_SCRIPT_VARIANTS: WorktreeSetupScriptVariant[] = [
  'posix',
  'powershell',
];

export const WORKTREE_SETUP_SCRIPT_RELATIVE_PATHS: Record<
  WorktreeSetupScriptVariant,
  string
> = {
  posix: '.stagewise/worktree-setup.sh',
  powershell: '.stagewise/worktree-setup.ps1',
};

export const WORKTREE_SETUP_SCRIPT_FILENAMES: Record<
  WorktreeSetupScriptVariant,
  string
> = {
  posix: 'worktree-setup.sh',
  powershell: 'worktree-setup.ps1',
};

/**
 * Determines which script variant runs on a given platform. A POSIX shell
 * script cannot run on Windows and a PowerShell script cannot run on POSIX, so
 * the host platform fully determines execution.
 */
export function variantForPlatform(
  platform: NodeJS.Platform,
): WorktreeSetupScriptVariant {
  return platform === 'win32' ? 'powershell' : 'posix';
}
