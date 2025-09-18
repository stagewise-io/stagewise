import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import type { DependencyMap } from './types.js';
import { log } from '../utils/logger.js';
import ignore from 'ignore';

async function loadGitignore(dir: string): Promise<ReturnType<typeof ignore>> {
  const ig = ignore();
  const gitignorePath = join(dir, '.gitignore');

  if (existsSync(gitignorePath)) {
    try {
      const content = await readFile(gitignorePath, 'utf-8');
      ig.add(content);
    } catch (error) {
      log.debug(`Failed to read .gitignore at ${gitignorePath}: ${error}`);
    }
  }

  // Always ignore node_modules and common non-source directories
  ig.add([
    'node_modules',
    '.git',
    'dist',
    'build',
    'coverage',
    '.next',
    '.nuxt',
  ]);

  return ig;
}

async function findPackageJsonFiles(
  dir: string,
  ig?: ReturnType<typeof ignore>,
): Promise<string[]> {
  const packageJsonFiles: string[] = [];

  // Check for package.json in current directory
  const packageJsonPath = join(dir, 'package.json');
  if (existsSync(packageJsonPath)) {
    packageJsonFiles.push(packageJsonPath);
  }

  try {
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
  } catch (error) {
    log.debug(`Error reading directory ${dir}: ${error}`);
  }

  return packageJsonFiles;
}

async function parsePackageJson(filePath: string): Promise<Set<string>> {
  const dependencies = new Set<string>();

  try {
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
  } catch (error) {
    log.debug(`Failed to parse package.json at ${filePath}: ${error}`);
  }

  return dependencies;
}

export async function discoverDependencies(
  workingDirectory: string = process.cwd(),
): Promise<DependencyMap> {
  log.debug(
    `Discovering dependencies from package.json files in: ${workingDirectory}`,
  );

  // Load gitignore rules
  const ig = await loadGitignore(workingDirectory);

  // Find all package.json files
  const packageJsonFiles = await findPackageJsonFiles(workingDirectory, ig);
  log.debug(`Found ${packageJsonFiles.length} package.json files`);

  // Parse all package.json files and collect unique dependencies
  const allDependencies = new Set<string>();

  for (const file of packageJsonFiles) {
    const deps = await parsePackageJson(file);
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

  log.debug(
    `Successfully discovered ${allDependencies.size} unique dependencies`,
  );

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
