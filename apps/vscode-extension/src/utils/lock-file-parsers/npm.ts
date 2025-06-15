import type { Dependencies } from './types';
import { compareVersions } from './version-comparator';

export function getInstalledDependencies(
  lockFileContent: string,
): Dependencies {
  const data = JSON.parse(lockFileContent);
  const dependencies: Dependencies = {};

  // For npm lockfile v2/v3: 'packages' object
  if (data.packages) {
    for (const [pkgPath, pkgData] of Object.entries<any>(data.packages)) {
      // Ignore the root package (empty string key)
      if (pkgPath === '') continue;
      // Only consider node_modules/* or node_modules/@scope/*
      const match = pkgPath.match(/^node_modules\/(.*)$/);
      if (!match) continue;
      const name = match[1];
      const version = pkgData.version;
      if (!version) continue;
      if (
        !dependencies[name] ||
        compareVersions(dependencies[name], version) > 0
      ) {
        dependencies[name] = version;
      }
    }
  }

  // For npm lockfile v1: 'dependencies' object
  if (data.dependencies) {
    const checkDeps = (deps: Record<string, any>) => {
      for (const [name, dep] of Object.entries(deps)) {
        if (dep.version) {
          if (
            !dependencies[name] ||
            compareVersions(dependencies[name], dep.version) > 0
          ) {
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
