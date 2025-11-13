import type { ClientRuntime } from '@stagewise/agent-runtime-interface';
import {
  getPackageManager,
  findProjectRoot,
} from '@stagewise/agent-project-information';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

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
  const searchRoot = gitRepoRoot ?? (await findProjectRoot(clientRuntime));

  const repoPackages: Package[] = filterNonWhitelistedDependencies(
    await getPackagesInPath(clientRuntime, gitRepoRoot),
  );

  const repoLikelyIsMonorepo = isLikelyAMonorepo(searchRoot, repoPackages);

  const packageManager = await getPackageManager(clientRuntime);

  return {
    gitRepoRoot,
    isLikelyMonorepo: repoLikelyIsMonorepo,
    packagesInRepo: repoPackages,
    packageManager: packageManager?.name ?? null,
  };
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

/**
 * Recursively travels through all paths in the given path and returns all paths where a package was found (plus the name of the package, it's version and it's dependencies).
 * The returned dependencies are a unified (and de-duped) list of all dependencies, devDependencies and peerDependencies.
 */
const getPackagesInPath = async (
  clientRuntime: ClientRuntime,
  rootPath: string,
): Promise<Package[]> => {
  const allPackageJsons = await clientRuntime.fileSystem.glob('**/*.json', {
    searchPath: rootPath,
    absoluteSearchPath: true,
    absoluteSearchResults: true,
  });

  const packages: Package[] = allPackageJsons.relativePaths
    ? (
        await Promise.all(
          allPackageJsons.relativePaths?.map(async (path) => {
            try {
              const packageJson = await readFile(path, 'utf-8');
              const parsedPackageJson = JSON.parse(packageJson).catch(
                () => null,
              );

              const pkgName = z.string().parse(parsedPackageJson?.name);
              const pkgVersion = z.string().parse(parsedPackageJson?.version);
              const unparsedPkgDependencies = z
                .record(z.string(), z.string())
                .parse(parsedPackageJson?.dependencies);
              const unparsedPkgDevDependencies = z
                .record(z.string(), z.string())
                .parse(parsedPackageJson?.devDependencies);
              const unparsedPkgPeerDependencies = z
                .record(z.string(), z.string())
                .parse(parsedPackageJson?.peerDependencies);

              const dependencies: Dependency[] = Object.entries(
                unparsedPkgDependencies,
              ).map(([name, version]) => ({ name, version }));
              const devDependencies: Dependency[] = Object.entries(
                unparsedPkgDevDependencies,
              ).map(([name, version]) => ({ name, version }));
              const peerDependencies: Dependency[] = Object.entries(
                unparsedPkgPeerDependencies,
              ).map(([name, version]) => ({ name, version }));

              return {
                name: pkgName,
                path: path,
                version: pkgVersion,
                dependencies: dependencies,
                devDependencies: devDependencies,
                peerDependencies: peerDependencies,
              };
            } catch {
              return null;
            }
          }),
        )
      ).filter((val) => val !== null)
    : [];

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
  }

  return newPackages;
};

const dependencyWhitelist = [
  'nextjs',
  'nuxtjs',
  'sveltekit',
  'solid-start',
  'remix',
  'astro',
  'qwik',
  'gatsby',

  // Frontend Frameworks
  'react',
  'vue',
  'angular',
  'svelte',
  'solid',
  'preact',
  'lit',
  'alpine',

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
