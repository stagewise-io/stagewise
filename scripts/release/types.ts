/**
 * Type definitions for the release scripts
 */

export type ReleaseChannel = 'alpha' | 'beta' | 'release';

export type VersionBump = 'patch' | 'minor' | 'major';

export interface PackageConfig {
  /** Short name for the package (used in CLI) */
  name: string;
  /** Path to package.json relative to repo root */
  path: string;
  /** Commit scope(s) that map to this package */
  scope: string;
  /** Whether to publish to npm registry */
  publishToNpm: boolean;
  /** Whether to create GitHub release */
  createGithubRelease: boolean;
  /** Git tag prefix (e.g., "stagewise@", "@stagewise/karton@") */
  tagPrefix: string;
  /** Whether prerelease channels (alpha/beta) are enabled. Default: true */
  prereleaseEnabled?: boolean;
}

export interface ParsedVersion {
  /** Full version string (e.g., "1.0.0-alpha.1") */
  full: string;
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
  /** Prerelease channel (alpha, beta) or null for release */
  prerelease: ReleaseChannel | null;
  /** Prerelease number (e.g., 1 in "alpha.1") or null */
  prereleaseNum: number | null;
  /** Base version without prerelease (e.g., "1.0.0") */
  base: string;
}

export interface ConventionalCommit {
  /** Full commit hash */
  hash: string;
  /** Short commit hash (7 chars) */
  shortHash: string;
  /** Commit type (feat, fix, etc.) */
  type: string;
  /** Commit scope */
  scope: string | null;
  /** Commit subject/description */
  subject: string;
  /** Commit body */
  body: string | null;
  /** Whether this is a breaking change */
  breaking: boolean;
  /** Breaking change description if present */
  breakingDescription: string | null;
}

export interface ChangelogEntry {
  /** Version string */
  version: string;
  /** Release date (YYYY-MM-DD) */
  date: string;
  /** Features added */
  features: ConventionalCommit[];
  /** Bug fixes */
  fixes: ConventionalCommit[];
  /** Breaking changes */
  breaking: ConventionalCommit[];
  /** Other changes (refactor, perf, etc.) */
  other: ConventionalCommit[];
}

export interface ReleaseResult {
  /** The new version string */
  version: string;
  /** Git tag name */
  tag: string;
  /** Generated changelog markdown */
  changelog: string;
  /** Whether this was a dry run */
  dryRun: boolean;
}

export interface CLIOptions {
  /** Package name to release */
  package: string;
  /** Target release channel */
  channel?: ReleaseChannel;
  /** Dry run mode */
  dryRun: boolean;
  /** Git ref to start from (for first releases without a tag) */
  since?: string;
  /** Start a new version cycle, abandoning any current prerelease */
  newCycle: boolean;
}
