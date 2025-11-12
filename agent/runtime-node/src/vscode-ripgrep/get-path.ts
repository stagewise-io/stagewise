import os from 'node:os';
import path from 'node:path';

/**
 * Determines the ripgrep binary path based on a base directory and platform.
 *
 * @param basePath - Base directory where ripgrep should be stored (e.g., ~/.stagewise)
 * @returns Full path to the ripgrep binary
 *
 * @example
 * ```typescript
 * const rgPath = getRipgrepPath('/home/user/.stagewise');
 * // Returns: '/home/user/.stagewise/bin/rg' on Unix
 * // Returns: 'C:\\Users\\user\\.stagewise\\bin\\rg.exe' on Windows
 * ```
 */
export function getRipgrepPath(basePath: string): string {
  const binDir = path.join(basePath, 'bin', 'ripgrep');
  const binaryName = os.platform() === 'win32' ? 'rg.exe' : 'rg';
  return path.join(binDir, binaryName);
}

/**
 * Gets the directory where the ripgrep binary should be stored.
 *
 * @param basePath - Base directory where ripgrep should be stored
 * @returns Directory path for the ripgrep binary
 */
export function getRipgrepBinDir(basePath: string): string {
  return path.join(basePath, 'bin', 'ripgrep');
}
