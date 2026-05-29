import { execSync } from 'node:child_process';

/**
 * Returns `true` when `workspacePath` is inside a git working tree.
 * Uses `execSync` (blocking) but is cheap enough for mount setup.
 * Never throws — any failure is treated as "not a git repo".
 */
export function isGitRepo(workspacePath: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: workspacePath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the current branch for `workspacePath` (or `null` on
 * detached HEAD / non-repo / any error). Never throws.
 */
export function getGitBranch(workspacePath: string): string | null {
  try {
    return (
      execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: workspacePath,
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim() || null
    );
  } catch {
    return null;
  }
}
