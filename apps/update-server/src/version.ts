import semver from 'semver';
import type { Channel } from './config.js';

export interface ParsedVersion {
  raw: string;
  clean: string;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  prereleaseType: 'alpha' | 'beta' | 'nightly' | null;
  prereleaseNum: number | null;
  nightlyDate: string | null;
}

function isValidNightlyDate(value: string): boolean {
  const year = Number.parseInt(value.slice(0, 4), 10);
  const month = Number.parseInt(value.slice(4, 6), 10);
  const day = Number.parseInt(value.slice(6, 8), 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseVersion(version: string): ParsedVersion | null {
  const clean = semver.clean(version);
  if (!clean) return null;

  const parsed = semver.parse(clean);
  if (!parsed) return null;

  let prereleaseType: 'alpha' | 'beta' | 'nightly' | null = null;
  let prereleaseNum: number | null = null;
  let nightlyDate: string | null = null;
  let prereleaseStr: string | null = null;

  if (parsed.prerelease.length > 0) {
    prereleaseStr = parsed.prerelease.join('.');
    const first = String(parsed.prerelease[0]);

    // New format: single concatenated identifier like "alpha063" / "beta063".
    // This is SemVer 1.0-compatible so Squirrel.Windows' embedded NuGet parser
    // (used client-side on Windows) can handle the filename-derived version.
    const concatenatedMatch = first.match(/^(alpha|beta)(\d+)$/);
    const nightlyMatch = first.match(/^nightly(\d{8})(\d{3})$/);
    if (concatenatedMatch) {
      prereleaseType = concatenatedMatch[1] as 'alpha' | 'beta';
      prereleaseNum = Number.parseInt(concatenatedMatch[2], 10);
    } else if (nightlyMatch && isValidNightlyDate(nightlyMatch[1])) {
      prereleaseType = 'nightly';
      nightlyDate = nightlyMatch[1];
      prereleaseNum = Number.parseInt(nightlyMatch[2] ?? '0', 10);
    } else if (first === 'alpha' || first === 'beta') {
      // Legacy format: two identifiers like ["alpha", 63].
      // Kept so the server can still reason about historical releases
      // that haven't been superseded yet.
      prereleaseType = first;
      if (
        parsed.prerelease.length > 1 &&
        typeof parsed.prerelease[1] === 'number'
      ) {
        prereleaseNum = parsed.prerelease[1];
      }
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
    nightlyDate,
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
    case 'nightly':
      return version.prereleaseType === 'nightly';
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
