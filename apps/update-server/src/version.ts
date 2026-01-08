import semver from 'semver';
import type { Channel } from './config.js';

export interface ParsedVersion {
  raw: string;
  clean: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  prereleaseType: 'alpha' | 'beta' | null;
  prereleaseNum: number | null;
}

export function parseVersion(version: string): ParsedVersion | null {
  const clean = semver.clean(version);
  if (!clean) return null;

  const parsed = semver.parse(clean);
  if (!parsed) return null;

  let prereleaseType: 'alpha' | 'beta' | null = null;
  let prereleaseNum: number | null = null;
  let prereleaseStr: string | null = null;

  if (parsed.prerelease.length > 0) {
    prereleaseStr = parsed.prerelease.join('.');
    const typeStr = String(parsed.prerelease[0]);
    if (typeStr === 'alpha') {
      prereleaseType = 'alpha';
    } else if (typeStr === 'beta') {
      prereleaseType = 'beta';
    }
    if (
      parsed.prerelease.length > 1 &&
      typeof parsed.prerelease[1] === 'number'
    ) {
      prereleaseNum = parsed.prerelease[1];
    }
  }

  return {
    raw: version,
    clean,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: prereleaseStr,
    prereleaseType,
    prereleaseNum,
  };
}

export function compareVersions(a: string, b: string): number {
  return semver.compare(a, b);
}

export function isNewerVersion(version: string, than: string): boolean {
  return semver.gt(version, than);
}

export function matchesChannel(
  version: ParsedVersion,
  channel: Channel,
): boolean {
  switch (channel) {
    case 'release':
      return version.prereleaseType === null;
    case 'beta':
      return version.prereleaseType === 'beta';
    case 'alpha':
      return (
        version.prereleaseType === 'alpha' || version.prereleaseType === 'beta'
      );
    default:
      return false;
  }
}

export function extractVersionFromTag(
  tag: string,
  appName: string,
): string | null {
  const prefix = `${appName}@`;
  if (!tag.startsWith(prefix)) return null;
  return tag.slice(prefix.length);
}
