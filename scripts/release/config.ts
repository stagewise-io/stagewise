/**
 * Package configuration for release management
 */

import type { PackageConfig } from './types.js';

/**
 * Configuration for packages that can be released independently.
 * Add new packages here as needed.
 */
export const packages: PackageConfig[] = [
  {
    name: 'stagewise',
    path: 'apps/browser/package.json',
    scope: 'stagewise',
    publishToNpm: false,
    createGithubRelease: true,
    tagPrefix: 'stagewise@',
    prereleaseEnabled: true,
  },
  {
    name: 'karton',
    path: 'packages/karton/package.json',
    scope: 'karton',
    publishToNpm: true,
    createGithubRelease: false,
    tagPrefix: '@stagewise/karton@',
    prereleaseEnabled: false,
  },
];

/**
 * Get package configuration by name
 */
export function getPackageConfig(name: string): PackageConfig | undefined {
  return packages.find((pkg) => pkg.name === name);
}

/**
 * Get list of available package names
 */
export function getAvailablePackageNames(): string[] {
  return packages.map((pkg) => pkg.name);
}
