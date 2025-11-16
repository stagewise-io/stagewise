import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { join } from 'node:path';
import { findProjectRoot } from './get-project-root.js';

/**
 * Supported package managers that can be detected
 */
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Information about the detected package manager
 */
export interface PackageManagerInfo {
  /** The name of the package manager */
  name: PackageManager;
  /** The version of the package manager if available */
  version?: string;
}

/**
 * Detects the package manager used in a project with high accuracy.
 *
 * This function uses multiple detection strategies in order of reliability:
 * 1. Explicit `packageManager` field in package.json (highest priority)
 * 2. Lock files presence (strong indicator)
 * 3. Workspace configuration files (fallback)
 *
 * @param clientRuntime - The client runtime providing filesystem access
 * @returns Promise that resolves to package manager info or null if none detected
 *
 * @example
 * ```typescript
 * // When package.json has "packageManager": "pnpm@10.10.0"
 * const manager = await getPackageManager(clientRuntime);
 * console.log(manager);
 * // { name: 'pnpm', version: '10.10.0' }
 * ```
 *
 * @example
 * ```typescript
 * // When only pnpm-lock.yaml exists
 * const manager = await getPackageManager(clientRuntime);
 * console.log(manager);
 * // { name: 'pnpm' }
 * ```
 *
 * @example
 * ```typescript
 * // When no package manager can be detected
 * const manager = await getPackageManager(clientRuntime);
 * console.log(manager);
 * // null
 * ```
 */
export async function getPackageManager(
  clientRuntime: ClientRuntime,
): Promise<PackageManagerInfo | null> {
  const fileSystem = clientRuntime.fileSystem;
  const rootPath = await findProjectRoot(clientRuntime);

  if (!rootPath) {
    return null;
  }

  // Priority 1: Check explicit packageManager field in package.json
  const packageJsonPath = join(rootPath, 'package.json');
  if (await fileSystem.fileExists(packageJsonPath)) {
    try {
      const result = await fileSystem.readFile(packageJsonPath);
      if (result.success && result.content) {
        const packageJson = JSON.parse(result.content);

        if (packageJson.packageManager) {
          // packageManager field format: "pnpm@10.10.0" or just "pnpm"
          const [name, version] = packageJson.packageManager.split('@');

          // Validate that it's a known package manager
          if (isValidPackageManager(name)) {
            return {
              name: name as PackageManager,
              ...(version && { version }),
            };
          }
        }
      }
    } catch {
      // Ignore JSON parsing errors, continue with other detection methods
    }
  }

  // Priority 2: Check lock files (in order of specificity/popularity)
  const lockFileChecks: Array<{ file: string; manager: PackageManager }> = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'package-lock.json', manager: 'npm' },
  ];

  for (const check of lockFileChecks) {
    const lockFilePath = join(rootPath, check.file);
    if (await fileSystem.fileExists(lockFilePath)) {
      return { name: check.manager };
    }
  }

  // Priority 3: Check workspace configuration files as fallback
  const workspaceFiles: Array<{ file: string; manager: PackageManager }> = [
    { file: 'pnpm-workspace.yaml', manager: 'pnpm' },
    { file: '.yarnrc.yml', manager: 'yarn' },
    { file: '.yarnrc', manager: 'yarn' },
  ];

  for (const check of workspaceFiles) {
    const workspaceFilePath = join(rootPath, check.file);
    if (await fileSystem.fileExists(workspaceFilePath)) {
      return { name: check.manager };
    }
  }

  // Priority 4: Check if package.json has workspaces field (npm or yarn)
  if (await fileSystem.fileExists(packageJsonPath)) {
    try {
      const result = await fileSystem.readFile(packageJsonPath);
      if (result.success && result.content) {
        const packageJson = JSON.parse(result.content);

        if (packageJson.workspaces) {
          // If we have workspaces but no lock file, it's likely npm
          // (yarn would have created yarn.lock by now)
          return { name: 'npm' };
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // No package manager detected
  return null;
}

/**
 * Type guard to check if a string is a valid package manager name
 */
function isValidPackageManager(name: string): name is PackageManager {
  return ['npm', 'pnpm', 'yarn', 'bun'].includes(name);
}
