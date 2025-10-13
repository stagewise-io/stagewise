import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { join, dirname, resolve } from 'node:path';

/**
 * Finds the outermost directory containing a package.json file by traversing up the directory tree.
 *
 * This function is particularly useful for finding the root of monorepos where you want to locate
 * the top-level package.json rather than a nested one. It starts from the current working directory
 * and walks up the filesystem until it finds the outermost (highest in the tree) directory that
 * contains a package.json file.
 *
 * @param clientRuntime - The client runtime providing filesystem access
 * @returns Promise that resolves to the outermost directory path containing package.json, or null if no package.json is found
 *
 * @example
 * ```typescript
 * // In a monorepo structure like:
 * // /workspace/monorepo/package.json
 * // /workspace/monorepo/packages/my-package/package.json
 * // /workspace/monorepo/packages/my-package/ <- current working directory
 *
 * const root = await findProjectRoot(clientRuntime);
 * console.log(root); // "/workspace/monorepo"
 * ```
 *
 * @example
 * ```typescript
 * // If no package.json exists anywhere in the directory tree:
 * const root = await findProjectRoot(clientRuntime);
 * console.log(root); // null
 * ```
 */
export async function findProjectRoot(
  clientRuntime: ClientRuntime,
): Promise<string | null> {
  const fileSystem = clientRuntime.fileSystem;
  let currentDir = fileSystem.getCurrentWorkingDirectory();
  let outermostPackageJsonPath: string | null = null;

  // Keep track of the previous directory to detect when we've reached the filesystem root
  let previousDir = '';

  while (currentDir !== previousDir) {
    const packageJsonPath = join(currentDir, 'package.json');

    // Check if package.json exists in the current directory
    if (await fileSystem.fileExists(packageJsonPath)) {
      // Store this as the outermost package.json path found so far
      outermostPackageJsonPath = currentDir;
    }

    // Move up one directory level
    previousDir = currentDir;
    currentDir = resolve(dirname(currentDir));
  }

  return outermostPackageJsonPath;
}

// Keep the old function name as an alias for backwards compatibility
export const getProjectRoot = findProjectRoot;
