import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { DependencyMap } from './types';
import { loadGitignore } from '../load-gitignore';
import type { Logger } from '@/services/logger';

async function findPackageJsonFiles(
  dir: string,
  ig?: Awaited<ReturnType<typeof loadGitignore>>,
): Promise<string[]> {
  const packageJsonFiles: string[] = [];

  // Check for package.json in current directory
  const packageJsonPath = join(dir, 'package.json');
  if (existsSync(packageJsonPath)) {
    packageJsonFiles.push(packageJsonPath);
  }

  const entries = await readdir(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const relativePath = entry;

    // Skip if ignored
    if (ig?.ignores(relativePath)) {
      continue;
    }

    const stats = await stat(fullPath);
    if (stats.isDirectory()) {
      // Recursively search subdirectories
      const subDirFiles = await findPackageJsonFiles(fullPath, ig);
      packageJsonFiles.push(...subDirFiles);
    }
  }

  return packageJsonFiles;
}

async function parsePackageJson(
  filePath: string,
  _logger: Logger,
): Promise<Set<string>> {
  const dependencies = new Set<string>();

  const content = await readFile(filePath, 'utf-8');
  const packageData = JSON.parse(content);

  // Collect all types of dependencies
  const depFields = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ];

  for (const field of depFields) {
    if (packageData[field] && typeof packageData[field] === 'object') {
      for (const depName of Object.keys(packageData[field])) {
        dependencies.add(depName);
      }
    }
  }

  return dependencies;
}

export async function discoverDependencies(
  workingDirectory: string,
  logger: Logger,
): Promise<DependencyMap> {
  // Load gitignore rules
  const ig = await loadGitignore(workingDirectory);

  // Find all package.json files
  const packageJsonFiles = await findPackageJsonFiles(workingDirectory, ig);

  // Parse all package.json files and collect unique dependencies
  const allDependencies = new Set<string>();

  for (const file of packageJsonFiles) {
    const deps = await parsePackageJson(file, logger).catch((err) => {
      logger.error(
        `[discoverDependencies] Failed to parse package.json file: ${file}. Reason: ${err}`,
      );
      return new Set<string>();
    });
    deps.forEach((dep) => allDependencies.add(dep));
  }

  // Convert to DependencyMap format (without version info as requested)
  const dependencyMap: DependencyMap = {};

  for (const depName of allDependencies) {
    dependencyMap[depName] = {
      name: depName,
      version: 'unknown',
      major: 0,
      minor: 0,
      patch: 0,
    };
  }

  return dependencyMap;
}

export function getDependencyList(dependencies: DependencyMap): string[] {
  return Object.keys(dependencies).sort();
}

export function getDependencyInfo(
  dependencies: DependencyMap,
  packageName: string,
) {
  return dependencies[packageName];
}

export type { DependencyMap, Dependency, PackageManager } from './types.js';
