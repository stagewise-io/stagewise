import type { Dependencies } from './types';
import { compareVersions } from './version-comparator';

export function getInstalledDependencies(
  lockFileContent: string,
): Dependencies {
  const data = JSON.parse(lockFileContent);
  const dependencies: Dependencies = {};

  // Bun lock file: packages is an object where each key is the package name,
  // and the value is an array: [fullNameWithVersion, ...]
  if (data.packages) {
    for (const [pkgName, pkgDetails] of Object.entries<any>(data.packages)) {
      // pkgDetails[0] is like '@package-name@version'
      const fullNameWithVersion = pkgDetails[0];
      const atIndex = fullNameWithVersion.lastIndexOf('@');
      if (atIndex <= 0) continue; // skip malformed
      const name = fullNameWithVersion.slice(0, atIndex);
      const version = fullNameWithVersion.slice(atIndex + 1);
      if (
        !dependencies[name] ||
        compareVersions(dependencies[name], version) > 0
      ) {
        dependencies[name] = version;
      }
    }
  }

  return dependencies;
}
