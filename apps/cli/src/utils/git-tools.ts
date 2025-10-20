import { execSync } from 'node:child_process';

/**
 * Gets the root of the git repository for a given path.
 * If the check fails, we simply return the path itself again.
 */
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
