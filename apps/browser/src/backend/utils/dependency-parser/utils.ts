import type { Dependency } from './types.js';

export function parseSemver(version: string): Omit<Dependency, 'name'> {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(.*)$/);

  if (!match) {
    throw new Error(`Invalid semver format: ${version}`);
  }

  const [, major, minor, patch, suffix] = match;

  return {
    version: version.replace(/^v/, ''),
    major: Number.parseInt(major!, 10),
    minor: Number.parseInt(minor!, 10),
    patch: Number.parseInt(patch!, 10),
    suffix: suffix || undefined,
  };
}

export function normalizeVersion(version: string): string {
  return version.replace(/^v/, '');
}
