import type { Dependencies } from './types';
import { compareVersions } from './version-comparator';
import yaml from 'js-yaml';

/**
 * Parses a pnpm-lock.yaml file and returns a flat map of dependency name to version.
 * Handles both standalone and monorepo (workspace) pnpm setups.
 */
export function getInstalledDependencies(
  lockFileContent: string,
): Dependencies {
  const data = yaml.load(lockFileContent) as any;
  const dependencies: Dependencies = {};

  if (!data || typeof data !== 'object') {
    return dependencies;
  }

  // 1. Collect all package versions from the 'packages' section
  //    The key is like '/package-name/1.2.3' or '/@scope/name/1.2.3'
  if (data.packages) {
    for (const [pkgPath, _pkgData] of Object.entries<any>(data.packages)) {
      // Extract the package name and version from the path
      // e.g. '/react/18.2.0' => name: 'react', version: '18.2.0'
      const match = pkgPath.match(/^((?:@)?(?:[^@]+))@([a-zA-Z\d.-]+).*$/);
      if (!match) continue;
      const name = match[1];
      const version = match[2];
      if (
        !dependencies[name] ||
        compareVersions(dependencies[name], version) > 0
      ) {
        dependencies[name] = version;
      }
    }
  }

  // 2. For monorepos, also check the 'importers' section for direct dependencies
  //    (importers keys are usually '.' for root, or 'packages/pkgname' for workspaces)
  if (data.importers) {
    for (const importer of Object.values<any>(data.importers)) {
      for (const depType of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
      ]) {
        if (importer[depType]) {
          for (const [name, versionSpec] of Object.entries<any>(
            importer[depType],
          )) {
            let version: string;
            if (typeof versionSpec === 'string') {
              version = versionSpec;
            } else if (versionSpec?.version) {
              version = versionSpec.version;
            } else {
              continue;
            }

            // If it's a path, extract the version from it.
            // e.g. '/react/18.2.0' => '18.2.0'
            const match = version.match(/^\/((?:@[^/]+\/)?[^/]+)\/(.+)$/);
            if (match) {
              version = match[2];
            }

            if (version.includes('(')) {
              version = version.split('(')[0];
            }

            // A simple check to filter out non-version strings like 'link:...'
            if (/^\d/.test(version)) {
              if (
                !dependencies[name] ||
                compareVersions(dependencies[name], version) > 0
              ) {
                dependencies[name] = version;
              }
            }
          }
        }
      }
    }
  }

  return dependencies;
}
