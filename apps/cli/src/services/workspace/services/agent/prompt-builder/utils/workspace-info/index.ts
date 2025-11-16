import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { getProjectRoot } from './get-project-root';
import { getPackageManager } from './get-package-manager';

type Dependency = {
  name: string;
  version: string;
};

type Package = {
  name: string; // name of the package from it's package.json
  path: string; // path relative to monorepo root
  version?: string;
  devDependencies: Dependency[];
  dependencies: Dependency[];
  peerDependencies: Dependency[];
};

export type WorkspaceInfo = {
  gitRepoRoot: string | null;
  isLikelyMonorepo: boolean;
  packagesInRepo: Package[];
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
};

export async function getWorkspaceInfo(
  clientRuntime: ClientRuntime,
): Promise<WorkspaceInfo> {
  // Gather all project information
  const gitRepoRoot = getRepoRootForPath(
    clientRuntime.fileSystem.getCurrentWorkingDirectory(),
  );

  // We search forp packages either based on the root of a git repo or the highest directory level that contains a package.json
  const searchRoot = gitRepoRoot ?? (await getProjectRoot(clientRuntime));

  const repoPackages: Package[] = filterPackagesWithoutRelevance(
    filterNonWhitelistedDependencies(
      await getPackagesInPath(clientRuntime, gitRepoRoot),
    ),
  ).slice(0, 20); // We only keep the top 20 packages with the most relevant dependencies. To prevent crazy pollution.

  const repoLikelyIsMonorepo = isLikelyAMonorepo(searchRoot, repoPackages);

  const packageManager = await getPackageManager(clientRuntime);

  const info: WorkspaceInfo = {
    gitRepoRoot,
    isLikelyMonorepo: repoLikelyIsMonorepo,
    packagesInRepo: repoPackages,
    packageManager: packageManager?.name ?? null,
  };

  return info;
}

/**
 * Gets the root of the git repository for a given path.
 * If the check fails, we simply return the path itself again.
 */
const getRepoRootForPath = (path: string) => {
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

const packageJsonSchema = z.looseObject({
  name: z.string(),
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

/**
 * Recursively travels through all paths in the given path and returns all paths where a package was found (plus the name of the package, it's version and it's dependencies).
 * The returned dependencies are a unified (and de-duped) list of all dependencies, devDependencies and peerDependencies.
 */
const getPackagesInPath = async (
  clientRuntime: ClientRuntime,
  rootPath: string,
): Promise<Package[]> => {
  const allPackageJsons = await clientRuntime.fileSystem.glob('package.json', {
    searchPath: rootPath,
    absoluteSearchPath: true,
    absoluteSearchResults: true,
    excludePatterns: [
      '**/test/',
      '**/tests/',
      '**/output/',
      '**/dist/',
      '**/node_modules/',
      '**/coverage/',
      '**/build/',
      '**/binaries/',
      '**/bin/',
    ],
  });

  const packages: Package[] = (
    allPackageJsons.relativePaths
      ? (
          await Promise.all(
            allPackageJsons.relativePaths.map(async (path) => {
              try {
                const packageJson = await readFile(path, 'utf-8');
                const parsed = packageJsonSchema.parse(JSON.parse(packageJson));

                const dependencies: Dependency[] = Object.entries(
                  parsed.dependencies ?? {},
                ).map(([name, version]) => ({ name, version }));
                const devDependencies: Dependency[] = Object.entries(
                  parsed.devDependencies ?? {},
                ).map(([name, version]) => ({ name, version }));
                const peerDependencies: Dependency[] = Object.entries(
                  parsed.peerDependencies ?? {},
                ).map(([name, version]) => ({ name, version }));

                return {
                  name: parsed.name,
                  path: path,
                  version: parsed.version,
                  dependencies: dependencies,
                  devDependencies: devDependencies,
                  peerDependencies: peerDependencies,
                };
              } catch (err) {
                console.error('Error parsing package JSON: ', path, err);
                return null;
              }
            }),
          )
        ).filter((val) => val !== null)
      : []
  ).sort(
    (a, b) =>
      b.dependencies.length +
      b.devDependencies.length +
      b.peerDependencies.length -
      (a.dependencies.length +
        a.devDependencies.length +
        a.peerDependencies.length),
  );

  // We sort the packages with the highest amount of relevant dependencies first.

  return packages;
};

/**
 * Travels through all dependencies of every package and only keeps dependencies that are either whitelisted or part of the monorepo packages.
 */
const filterNonWhitelistedDependencies = (packages: Package[]): Package[] => {
  const newPackages = structuredClone(packages);

  for (const pkg of newPackages) {
    pkg.dependencies = pkg.dependencies.filter(
      (dep) =>
        dependencyWhitelist.includes(dep.name) ||
        newPackages.some((p) => p.name === dep.name),
    );
    pkg.devDependencies = pkg.devDependencies.filter(
      (dep) =>
        dependencyWhitelist.includes(dep.name) ||
        newPackages.some((p) => p.name === dep.name),
    );
    pkg.peerDependencies = pkg.peerDependencies.filter(
      (dep) =>
        dependencyWhitelist.includes(dep.name) ||
        newPackages.some((p) => p.name === dep.name),
    );
  }

  return newPackages;
};

const isPackageIncludingDependency = (
  pkg: Package,
  depName: string,
): boolean => {
  return (
    pkg.dependencies.some((dep) => dep.name === depName) ||
    pkg.devDependencies.some((dep) => dep.name === depName) ||
    pkg.peerDependencies.some((dep) => dep.name === depName)
  );
};

// Here,we take a list of packages, and if it's larger than 5 packages, we filter out packages, that:
// - have no relevant dependency
// - are not the dependency of any other package
// - are not the dependency of any other package
const filterPackagesWithoutRelevance = (packages: Package[]): Package[] => {
  if (packages.length <= 5) return packages;

  const newPackages = structuredClone(packages);

  newPackages.filter((pkg) => {
    const depsContainsRelevantDependency =
      pkg.dependencies.some((dep) => dependencyWhitelist.includes(dep.name)) ||
      pkg.devDependencies.some((dep) =>
        dependencyWhitelist.includes(dep.name),
      ) ||
      pkg.peerDependencies.some((dep) =>
        dependencyWhitelist.includes(dep.name),
      );

    if (depsContainsRelevantDependency) return true;

    const pkgIsDependencyOfAnyOtherPackage = newPackages.some((p) =>
      isPackageIncludingDependency(p, pkg.name),
    );

    if (pkgIsDependencyOfAnyOtherPackage) return true;

    return false;
  });

  return newPackages;
};

const dependencyWhitelist = [
  'next',
  'nuxt',
  'svelte',
  'solid-js',
  '@remix-run/server-runtime',
  '@remix-run/node',
  '@remix-run/react',
  '@remix-run/dev',
  'astro',
  'gatsby',

  // Frontend Frameworks
  'react',
  'vue',
  'angular',
  'svelte',
  'preact',
  'lit',
  'alpinejs',

  // Backend Frameworks
  'express',
  'fastify',
  'koa',
  'nestjs',
  'hapi',

  // Build Tools/Bundlers
  'vite',
  'webpack',
  'parcel',
  'rollup',
  'esbuild',

  // Testing Frameworks
  'jest',
  'vitest',
  'cypress',
  'playwright',
  'mocha',

  // Other typical utilities
  'tailwindcss',
  'postcss',
  'graphql',
  'bootstrap',
  'framer-motion',
  'lucide-react',
];

// A list of files typically found in monorepo projects
const monorepoToolFiles = [
  'pnpm-workspace.yaml',
  'lerna.json',
  'nx.json',
  'turbo.json',
  'rush.json',
  'yarn.lock', // Yarn workspaces detected via package.json
  'lage.config.js',
];

const isLikelyAMonorepo = (rootPath: string, packages: Package[]): boolean => {
  if (packages.length > 1) return true;

  for (const file of monorepoToolFiles) {
    if (existsSync(path.join(rootPath, file))) {
      return true;
    }
  }

  return false;
};
