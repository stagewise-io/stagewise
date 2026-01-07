#!/usr/bin/env tsx
/**
 * Release CLI - Version bumping and changelog generation
 *
 * Usage:
 *   pnpm tsx scripts/release/index.ts --package stagewise --channel beta
 *   pnpm tsx scripts/release/index.ts --package karton --channel release --dry-run
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';

import { getPackageConfig, getAvailablePackageNames } from './config.js';
import {
  getLastTag,
  getCommitsSince,
  getRecommendedBump,
  hasUncommittedChanges,
  getRepoRoot,
} from './git-utils.js';
import {
  calculateNextVersion,
  getPossibleNextVersions,
  parseVersion,
  isValidChannelTransition,
} from './bump-version.js';
import {
  updateChangelog,
  generateChangelogMarkdown,
  readReleaseNotes,
  deleteReleaseNotes,
  getReleaseNotesPath,
} from './generate-changelog.js';
import type { ReleaseChannel, CLIOptions, PackageConfig } from './types.js';

const VALID_CHANNELS: ReleaseChannel[] = ['alpha', 'beta', 'release'];

/**
 * Parse command line arguments
 */
function parseCliArgs(): CLIOptions {
  const { values } = parseArgs({
    options: {
      package: { type: 'string', short: 'p' },
      channel: { type: 'string', short: 'c' },
      'dry-run': { type: 'boolean', default: false },
      'new-cycle': { type: 'boolean', default: false },
      since: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
Release CLI - Version bumping and changelog generation

Usage:
  pnpm tsx scripts/release/index.ts --package <name> [--channel <channel>] [--dry-run]

Options:
  -p, --package <name>     Package to release (${getAvailablePackageNames().join(', ')})
  -c, --channel <channel>  Release channel (alpha, beta, release)
  -s, --since <ref>        Git ref to start from (commit, tag, branch) for first releases
  --new-cycle              Abandon current prerelease and start fresh version cycle
  --dry-run                Preview changes without applying them
  -h, --help               Show this help message

Examples:
  pnpm tsx scripts/release/index.ts --package stagewise --channel beta
  pnpm tsx scripts/release/index.ts --package karton --channel release
  pnpm tsx scripts/release/index.ts --package stagewise --dry-run

  # First release - only include commits after a specific point
  pnpm tsx scripts/release/index.ts --package stagewise --since abc1234

  # Abandon beta and start fresh alpha for next version
  pnpm tsx scripts/release/index.ts --package stagewise --channel alpha --new-cycle
`);
    process.exit(0);
  }

  if (!values.package) {
    console.error('Error: --package is required');
    console.error(
      `Available packages: ${getAvailablePackageNames().join(', ')}`,
    );
    process.exit(1);
  }

  const channel = values.channel as ReleaseChannel | undefined;
  if (channel && !VALID_CHANNELS.includes(channel)) {
    console.error(`Error: Invalid channel "${channel}"`);
    console.error(`Valid channels: ${VALID_CHANNELS.join(', ')}`);
    process.exit(1);
  }

  return {
    package: values.package,
    channel,
    dryRun: values['dry-run'] ?? false,
    since: values.since,
    newCycle: values['new-cycle'] ?? false,
  };
}

/**
 * Read current version from package.json
 */
async function getCurrentVersion(
  packageConfig: PackageConfig,
): Promise<string> {
  const repoRoot = await getRepoRoot();
  const packageJsonPath = path.join(repoRoot, packageConfig.path);
  const content = await readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  return pkg.version;
}

/**
 * Update package.json version
 */
async function updatePackageVersion(
  packageConfig: PackageConfig,
  newVersion: string,
): Promise<void> {
  const repoRoot = await getRepoRoot();
  const packageJsonPath = path.join(repoRoot, packageConfig.path);
  const content = await readFile(packageJsonPath, 'utf-8');
  const pkg = JSON.parse(content);
  pkg.version = newVersion;
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(pkg, null, 2)}\n`,
    'utf-8',
  );
}

/**
 * Write release artifacts for CI
 */
async function writeReleaseArtifacts(
  version: string,
  tag: string,
  releaseNotes: string,
): Promise<void> {
  const repoRoot = await getRepoRoot();
  await writeFile(path.join(repoRoot, '.release-version'), version, 'utf-8');
  await writeFile(path.join(repoRoot, '.release-tag'), tag, 'utf-8');
  await writeFile(
    path.join(repoRoot, '.release-notes.md'),
    releaseNotes,
    'utf-8',
  );
}

/**
 * Prompt user to select a channel interactively
 */
async function promptForChannel(
  currentVersion: string,
  bumpType: 'patch' | 'minor' | 'major',
): Promise<ReleaseChannel> {
  const possibleVersions = getPossibleNextVersions(currentVersion, bumpType);
  const parsed = parseVersion(currentVersion);

  console.log('\nSelect release channel:');

  // Filter available channels based on current version
  const availableChannels = VALID_CHANNELS.filter((channel) =>
    isValidChannelTransition(parsed.prerelease, channel),
  );

  for (const [i, channel] of availableChannels.entries()) {
    const version = possibleVersions[channel];
    console.log(`  ${i + 1}. ${channel} -> ${version}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `\nEnter choice (1-${availableChannels.length}): `,
      (answer) => {
        rl.close();
        const choice = Number.parseInt(answer, 10) - 1;
        const selectedChannel = availableChannels[choice];
        if (
          choice >= 0 &&
          choice < availableChannels.length &&
          selectedChannel
        ) {
          resolve(selectedChannel);
        } else {
          console.error('Invalid choice');
          process.exit(1);
        }
      },
    );
  });
}

/**
 * Confirm release with user
 */
async function confirmRelease(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('\nProceed with release? (y/N): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Main release flow
 */
async function main(): Promise<void> {
  const options = parseCliArgs();

  // Get package config
  const packageConfig = getPackageConfig(options.package);
  if (!packageConfig) {
    console.error(`Error: Unknown package "${options.package}"`);
    console.error(
      `Available packages: ${getAvailablePackageNames().join(', ')}`,
    );
    process.exit(1);
  }

  console.log(`\n📦 Releasing: ${packageConfig.name}`);

  // Check for uncommitted changes
  if (!options.dryRun && (await hasUncommittedChanges())) {
    console.error(
      'Error: You have uncommitted changes. Please commit or stash them first.',
    );
    process.exit(1);
  }

  // Get current version
  const currentVersion = await getCurrentVersion(packageConfig);
  console.log(`   Current version: ${currentVersion}`);

  // Get last tag for this package
  const lastTag = await getLastTag(packageConfig.tagPrefix);
  console.log(`   Last tag: ${lastTag || 'none'}`);

  // Determine starting point for commits
  const sinceRef = options.since || lastTag;
  if (options.since) {
    console.log(`   Using --since: ${options.since}`);
  }

  // Get commits since last tag or specified ref
  const commits = await getCommitsSince(sinceRef, packageConfig.scope);
  console.log(`   Commits since last release: ${commits.length}`);

  // Check for custom release notes
  const customNotes = await readReleaseNotes(packageConfig.name);
  if (customNotes) {
    const notesPath = await getReleaseNotesPath(packageConfig.name);
    console.log(`   Custom release notes: ${notesPath}`);
  }

  if (commits.length === 0) {
    console.error(
      `\nError: No commits with scope "${packageConfig.scope}" found since last release.`,
    );
    console.error('Nothing to release.');
    process.exit(1);
  }

  // Warn if this is a first release (no previous tag and no --since)
  if (!lastTag && !options.since) {
    console.log(
      `\n   ⚠️  First release detected - all matching commits will be included`,
    );
    console.log(
      `      Use --since <commit> to limit which commits are included`,
    );
  }

  // Show commits
  console.log('\n   Commits to include:');
  for (const commit of commits.slice(0, 10)) {
    const breaking = commit.breaking ? ' [BREAKING]' : '';
    console.log(
      `   - ${commit.type}(${commit.scope}): ${commit.subject}${breaking}`,
    );
  }
  if (commits.length > 10) {
    console.log(`   ... and ${commits.length - 10} more`);
  }

  // Get recommended bump
  const bumpType = getRecommendedBump(commits);
  if (!bumpType) {
    console.error('\nError: Could not determine version bump type.');
    process.exit(1);
  }
  console.log(`\n   Recommended bump: ${bumpType}`);

  // Check if prerelease channels are enabled for this package
  const prereleaseEnabled = packageConfig.prereleaseEnabled !== false;

  // Get target channel
  let targetChannel = options.channel;

  if (!prereleaseEnabled) {
    // For packages without prerelease, always use 'release' channel
    if (targetChannel && targetChannel !== 'release') {
      console.error(
        `\nError: Package "${packageConfig.name}" does not support prerelease channels.`,
      );
      console.error('Only regular semver releases are allowed.');
      process.exit(1);
    }
    if (options.newCycle) {
      console.error(
        `\nError: --new-cycle is not supported for package "${packageConfig.name}".`,
      );
      process.exit(1);
    }
    targetChannel = 'release';
    console.log('   Mode: standard semver (no prereleases)');
  } else if (!targetChannel) {
    // Interactive channel selection for packages with prerelease enabled
    targetChannel = await promptForChannel(currentVersion, bumpType);
  }

  // Handle --new-cycle: abandon current prerelease and start fresh
  let versionForCalculation = currentVersion;
  const parsed = parseVersion(currentVersion);

  if (options.newCycle) {
    if (!parsed.prerelease) {
      console.error(
        '\nError: --new-cycle is only valid when current version is a prerelease.',
      );
      console.error(`Current version ${currentVersion} is already a release.`);
      process.exit(1);
    }
    if (targetChannel === 'release') {
      console.error(
        '\nError: --new-cycle cannot be used with release channel.',
      );
      console.error('Use --new-cycle with alpha or beta to start a new cycle.');
      process.exit(1);
    }
    // Use the base version so bump gets applied fresh
    versionForCalculation = parsed.base;
    console.log(
      `\n   🔄 New cycle: abandoning ${currentVersion}, starting fresh from ${parsed.base}`,
    );
  }

  // Calculate new version
  const newVersion = calculateNextVersion(
    versionForCalculation,
    bumpType,
    targetChannel,
  );
  const newTag = `${packageConfig.tagPrefix}${newVersion}`;

  console.log(`\n   Target channel: ${targetChannel}`);
  console.log(`   New version: ${newVersion}`);
  console.log(`   New tag: ${newTag}`);

  // Dry run mode
  if (options.dryRun) {
    console.log('\n🔍 Dry run mode - no changes will be made\n');

    // Generate changelog preview
    const changelogPreview = generateChangelogMarkdown(
      newVersion,
      commits,
      new Date(),
      customNotes,
    );
    if (customNotes) {
      console.log(
        'Custom release notes found - will be merged into changelog\n',
      );
    }
    console.log('Changelog preview:');
    console.log('---');
    console.log(changelogPreview);
    console.log('---');
    return;
  }

  // Confirm with user (only in interactive mode)
  if (!process.env.CI) {
    const confirmed = await confirmRelease();
    if (!confirmed) {
      console.log('Release cancelled.');
      process.exit(0);
    }
  }

  // Update package.json version
  console.log('\n📝 Updating package.json...');
  await updatePackageVersion(packageConfig, newVersion);

  // Update changelog
  console.log('📝 Updating CHANGELOG.md...');
  const releaseNotes = await updateChangelog(
    packageConfig,
    newVersion,
    targetChannel,
    commits,
    customNotes,
  );

  // Delete custom release notes file if it was used
  if (customNotes) {
    console.log('📝 Removing custom release notes file...');
    await deleteReleaseNotes(packageConfig.name);
  }

  // Write release artifacts for CI
  console.log('📝 Writing release artifacts...');
  await writeReleaseArtifacts(newVersion, newTag, releaseNotes);

  console.log('\n✅ Release prepared successfully!');
  console.log(`   Version: ${newVersion}`);
  console.log(`   Tag: ${newTag}`);

  if (!process.env.CI) {
    console.log('\nNext steps:');
    console.log('  1. Review changes: git diff');
    console.log(
      `  2. Commit: git add . && git commit -m "chore(${packageConfig.scope}): release ${newVersion}"`,
    );
    console.log(`  3. Create tag: git tag ${newTag}`);
    console.log('  4. Push: git push && git push --tags');
  }
}

// Run
main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
