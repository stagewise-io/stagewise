import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if any of the given files exist in the project root
 */
export async function hasAnyFile(
  root: string,
  filenames: string[],
): Promise<boolean> {
  for (const filename of filenames)
    if (await fileExists(path.join(root, filename))) return true;

  return false;
}

/**
 * Find a binary in node_modules/.bin
 */
export async function findNodeModulesBin(
  root: string,
  binary: string,
): Promise<string | undefined> {
  const binPath = path.join(root, 'node_modules', '.bin', binary);
  if (await fileExists(binPath)) return binPath;

  return undefined;
}

/**
 * Check if a package is installed in node_modules
 */
export async function isPackageInstalled(
  root: string,
  packageName: string,
): Promise<boolean> {
  const packagePath = path.join(root, 'node_modules', packageName);
  return fileExists(packagePath);
}

/**
 * Get the path to a package in node_modules
 */
export async function getPackagePath(
  root: string,
  packageName: string,
): Promise<string | undefined> {
  const packagePath = path.join(root, 'node_modules', packageName);
  if (await fileExists(packagePath)) return packagePath;

  return undefined;
}
