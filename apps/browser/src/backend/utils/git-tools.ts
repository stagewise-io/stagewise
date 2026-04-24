import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Gets the root of the git repository for a given path.
 * If the check fails, we simply return the path itself again.
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

/**
 * Async, single-call git detection that returns both `isGitRepo` and the
 * current branch (or null for detached HEAD / non-repo).
 *
 * Uses `execFile` (non-blocking) and `-C <path>` so a missing directory
 * returns a clean rejection rather than throwing synchronously.
 */
export async function getGitInfo(
  path: string,
): Promise<{ isGitRepo: boolean; gitBranch: string | null }> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'],
      // 2s timeout to bound the probe; a hung git call on a slow/
      // disconnected mount (network drive, sleeping disk, etc.) must not
      // block the entire `getStoredInstance` RPC across all mounts. The
      // existing catch treats timeout identically to a non-repo result.
      { encoding: 'utf8', timeout: 2000 },
    );
    const branch = stdout.trim();
    return {
      isGitRepo: true,
      gitBranch: branch === 'HEAD' ? null : branch || null,
    };
  } catch {
    return { isGitRepo: false, gitBranch: null };
  }
}

export const getRepoRootForPath = (path: string) => {
  try {
    // Execute the git command, starting from the given directory
    const root = execSync('git rev-parse --show-toplevel', {
      cwd: path,
      encoding: 'utf8',
    });

    // The command output includes a trailing newline, so we trim it.
    return root.trim();
  } catch {
    return path;
  }
};
