/**
 * Version bumping logic with prerelease channel support
 */

import semver from 'semver';
import type { ParsedVersion, ReleaseChannel, VersionBump } from './types.js';

/**
 * Parse a version string into its components
 */
export function parseVersion(version: string): ParsedVersion {
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid version: ${version}`);
  }

  let prerelease: ReleaseChannel | null = null;
  let prereleaseNum: number | null = null;

  if (parsed.prerelease.length >= 2) {
    const channel = parsed.prerelease[0];
    if (channel === 'alpha' || channel === 'beta') {
      prerelease = channel;
      prereleaseNum =
        typeof parsed.prerelease[1] === 'number'
          ? parsed.prerelease[1]
          : Number.parseInt(String(parsed.prerelease[1]), 10);
    }
  }

  return {
    full: version,
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease,
    prereleaseNum,
    base: `${parsed.major}.${parsed.minor}.${parsed.patch}`,
  };
}

/**
 * Calculate the next version based on current version, bump type, and target channel
 *
 * Version transitions:
 * - Same prerelease channel: increment prerelease number (1.0.0-alpha.1 -> 1.0.0-alpha.2)
 * - Upgrade channel (alpha->beta): reset prerelease number (1.0.0-alpha.5 -> 1.0.0-beta.1)
 * - To release: remove prerelease (1.0.0-beta.3 -> 1.0.0)
 * - From release to prerelease: apply bump, add prerelease (1.0.0 -> 1.0.1-alpha.1)
 */
export function calculateNextVersion(
  currentVersion: string,
  bumpType: VersionBump,
  targetChannel: ReleaseChannel,
): string {
  const current = parseVersion(currentVersion);

  // Case 1: Target is a stable release
  if (targetChannel === 'release') {
    // If already a release version, apply the bump
    if (!current.prerelease) {
      return semver.inc(currentVersion, bumpType) || currentVersion;
    }

    // If coming from prerelease, just drop the prerelease tag
    // The base version already represents the "next" version
    return current.base;
  }

  // Case 2: Target is a prerelease (alpha or beta)

  // If current is a stable release, apply bump and start at prerelease.1
  if (!current.prerelease) {
    const bumpedBase = semver.inc(currentVersion, bumpType);
    if (!bumpedBase) {
      throw new Error(
        `Failed to bump version ${currentVersion} with ${bumpType}`,
      );
    }
    return `${bumpedBase}-${targetChannel}.1`;
  }

  // If same channel, increment the prerelease number
  if (current.prerelease === targetChannel) {
    const nextNum = (current.prereleaseNum || 0) + 1;
    return `${current.base}-${targetChannel}.${nextNum}`;
  }

  // Channel upgrade (alpha -> beta)
  // Check that we're not going backwards (beta -> alpha)
  const channelOrder: Record<ReleaseChannel, number> = {
    alpha: 0,
    beta: 1,
    release: 2,
  };

  if (channelOrder[targetChannel] < channelOrder[current.prerelease]) {
    throw new Error(
      `Cannot downgrade from ${current.prerelease} to ${targetChannel}. ` +
        `Channel order is: alpha -> beta -> release`,
    );
  }

  // Upgrade channel: reset to .1
  return `${current.base}-${targetChannel}.1`;
}

/**
 * Get a list of possible next versions for display
 */
export function getPossibleNextVersions(
  currentVersion: string,
  bumpType: VersionBump,
): Record<ReleaseChannel, string> {
  return {
    alpha: calculateNextVersion(currentVersion, bumpType, 'alpha'),
    beta: calculateNextVersion(currentVersion, bumpType, 'beta'),
    release: calculateNextVersion(currentVersion, bumpType, 'release'),
  };
}

/**
 * Validate that a channel transition is allowed
 */
export function isValidChannelTransition(
  currentChannel: ReleaseChannel | null,
  targetChannel: ReleaseChannel,
): boolean {
  // From release to any prerelease is allowed
  if (currentChannel === null) {
    return true;
  }

  // To release is always allowed
  if (targetChannel === 'release') {
    return true;
  }

  // Same channel is allowed
  if (currentChannel === targetChannel) {
    return true;
  }

  // alpha -> beta is allowed
  if (currentChannel === 'alpha' && targetChannel === 'beta') {
    return true;
  }

  // beta -> alpha is NOT allowed
  return false;
}
