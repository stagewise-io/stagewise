import type { Dependencies } from './types';
import { compareVersions } from './version-comparator';

export function getInstalledDependencies(
  lockFileContent: string,
): Dependencies {
  const data = JSON.parse(lockFileContent);
  const dependencies: Dependencies = {};

  // package-lock.json has a packages object with all dependencies
  if (data.packages) {
    for (const [pkgPath, pkgData] of Object.entries(data.packages)) {
      const version = (pkgData as any).version;
      if (Object.keys(dependencies).includes(pkgPath)) {
        // If the dependency is already in the dependencies object, update the version
        // We keep the oldest version
        if (compareVersions(dependencies[pkgPath], version) > 0) {
          dependencies[pkgPath] = version;
        }
      }
    }
  }

  // Also check dependencies for older package-lock.json versions
  if (data.dependencies) {
    const checkDeps = (deps: Record<string, any>) => {
      for (const [name, dep] of Object.entries(deps)) {
        if (Object.keys(dependencies).includes(name)) {
          // If the dependency is already in the dependencies object, update the version
          // We keep the oldest version
          if (compareVersions(dependencies[name], dep.version) > 0) {
            dependencies[name] = dep.version;
          }
        }
        if (dep.dependencies) {
          checkDeps(dep.dependencies);
        }
      }
    };
    checkDeps(data.dependencies);
  }

  return dependencies;
}

/**
 * Parses a yarn.lock v1 file and returns a Dependencies object mapping package names to their installed versions.
 * If multiple versions are present, keeps the oldest version.
 */
export function getInstalledDependenciesFromYarnLock(
  lockFileContent: string,
): Dependencies {
  const dependencies: Dependencies = {};
  // Split by double newlines to get each block
  const blocks = lockFileContent.split(/\n{2,}/g);
  for (const block of blocks) {
    // Match the header line: "pkg@version-range": or pkg@version-range:
    const headerMatch = block.match(
      /^(?:"|')?((?:@[^/\s]+\/)?[^@\s]+)@[^\n]+(?=":|:)/m,
    );
    if (!headerMatch) continue;
    const name = headerMatch[1];
    // Match the version line: version "x.y.z"
    const versionMatch = block.match(/\n\s*version\s+"([^"]+)"/);
    if (!versionMatch) continue;
    const version = versionMatch[1];
    if (dependencies[name]) {
      // Keep the oldest version
      if (compareVersions(dependencies[name], version) > 0) {
        dependencies[name] = version;
      }
    } else {
      dependencies[name] = version;
    }
  }
  return dependencies;
}
