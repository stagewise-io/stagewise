/**
 * Version bumping logic with prerelease channel support
 */

import semver from 'semver';
import type { ParsedVersion, ReleaseChannel, VersionBump } from './types.js';

/**
 * Zero-pad a prerelease number to 3 digits.
 *
 * The new-format prerelease identifier is intentionally lexicographically
 * sortable: `alpha010` > `alpha009` only if both are padded, because
 * SemVer 2.0 compares non-purely-numeric identifiers as strings.
 *
 * The counter is therefore capped at `PRERELEASE_NUM_MAX` (= 999 for 3-digit
 * padding). Beyond that boundary the string comparison flips — for example
 * `semver.gt('1.0.0-alpha1000', '1.0.0-alpha999')` returns `false` because
 * the character `'1'` sorts before `'9'`. Letting a bump slip through would
 * silently break update-ordering on the server side. We therefore hard-fail
 * here and force a conscious decision (bump base version, promote channel,
 * or widen padding in a coordinated migration).
 */
const PRERELEASE_NUM_PADDING = 3;
const PRERELEASE_NUM_MAX = 10 ** PRERELEASE_NUM_PADDING - 1;
function padPrereleaseNum(n: number): string {
  if (n > PRERELEASE_NUM_MAX) {
    throw new Error(
      `Prerelease number ${n} exceeds the maximum supported value (${PRERELEASE_NUM_MAX}). ` +
        `The prerelease identifier is zero-padded to ${PRERELEASE_NUM_PADDING} digits so ` +
        `SemVer string-comparison keeps the natural ordering. Going beyond ${PRERELEASE_NUM_MAX} ` +
        `would break ordering (e.g. "alpha1000" < "alpha999" lexically, so the update server ` +
        `would serve an older release as "newer"). ` +
        `Options: bump the base version (patch/minor/major) so the counter resets, ` +
        `promote to the next channel (alpha -> beta -> release), or widen ` +
        `PRERELEASE_NUM_PADDING (requires a coordinated migration of all published tags).`,
    );
  }
  return String(n).padStart(PRERELEASE_NUM_PADDING, '0');
}

/**
 * Parse a version string into its components.
 *
 * Accepts both the current format and the legacy format so historical
 * releases can still be reasoned about (e.g. re-running the bump script
 * against a repo whose latest tag predates the format switch).
 *
 * - New format: `1.0.0-alpha063` (single concatenated prerelease identifier,
 *   SemVer 1.0-compatible so Squirrel.Windows' NuGet parser accepts it).
 *   `semver.parse(...).prerelease` is `['alpha063']`.
 * - Legacy format: `1.0.0-alpha.63` (dot-separated, SemVer 2.0 only).
 *   `semver.parse(...).prerelease` is `['alpha', 63]`.
 */
export function parseVersion(version: string): ParsedVersion {
  const parsed = semver.parse(version);
  if (!parsed) {
    throw new Error(`Invalid version: ${version}`);
  }

  let prerelease: ReleaseChannel | null = null;
  let prereleaseNum: number | null = null;

  if (parsed.prerelease.length >= 1) {
    const first = String(parsed.prerelease[0]);

    // New format: single identifier like "alpha063" / "beta063".
    const concatenatedMatch = first.match(/^(alpha|beta)(\d+)$/);
    if (concatenatedMatch) {
      prerelease = concatenatedMatch[1] as ReleaseChannel;
      prereleaseNum = Number.parseInt(concatenatedMatch[2] ?? '0', 10);
    } else if (
      (first === 'alpha' || first === 'beta') &&
      parsed.prerelease.length >= 2
    ) {
      // Legacy format: two identifiers like ["alpha", 63].
      prerelease = first;
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
 * Calculate the next version based on current version, bump type, and target channel.
 *
 * Prerelease identifiers are zero-padded to 3 digits and concatenated with
 * the channel name (e.g. `alpha001`, not `alpha.1`). This keeps the version
 * string SemVer 1.0-compatible so Squirrel.Windows' embedded NuGet parser
 * can handle it.
 *
 * Version transitions:
 * - Same prerelease channel: increment prerelease number (1.0.0-alpha001 -> 1.0.0-alpha002)
 * - Upgrade channel (alpha->beta): reset prerelease number (1.0.0-alpha005 -> 1.0.0-beta001)
 * - To release: remove prerelease (1.0.0-beta003 -> 1.0.0)
 * - From release to prerelease: apply bump, add prerelease (1.0.0 -> 1.0.1-alpha001)
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
    return `${bumpedBase}-${targetChannel}${padPrereleaseNum(1)}`;
  }

  // If same channel, increment the prerelease number
  if (current.prerelease === targetChannel) {
    const nextNum = (current.prereleaseNum || 0) + 1;
    return `${current.base}-${targetChannel}${padPrereleaseNum(nextNum)}`;
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

  // Upgrade channel: reset to 001
  return `${current.base}-${targetChannel}${padPrereleaseNum(1)}`;
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
