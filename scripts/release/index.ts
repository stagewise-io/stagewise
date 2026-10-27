#!/usr/bin/env tsx
/**
 * Release CLI - Version bumping and changelog generation
 *
 * Usage:
 *   pnpm tsx scripts/release/index.ts --package stagewise
 *   pnpm tsx scripts/release/index.ts --package karton --dry-run
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import * as readline from 'node:readline';
import semver from 'semver';

import { getPackageConfig, getAvailablePackageNames } from './config.js';
import {
  getLastStableTag,
  getCommitsSince,
  getRecommendedBump,
  hasUncommittedChanges,
  getRepoRoot,
} from './git-utils.js';
import {
  updateChangelog,
  generateChangelogMarkdown,
  readReleaseNotes,
  deleteReleaseNotes,
  getReleaseNotesPath,
} from './generate-changelog.js';
import type { CLIOptions, PackageConfig } from './types.js';

/**
 * Parse command line arguments
 */
function parseCliArgs(): CLIOptions {
  const { values } = parseArgs({
    options: {
      package: { type: 'string', short: 'p' },
      'dry-run': { type: 'boolean', default: false },
      since: { type: 'string', short: 's' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help) {
    console.log(`
Release CLI - Version bumping and changelog generation

Usage:
  pnpm tsx scripts/release/index.ts --package <name> [--dry-run]

Options:
  -p, --package <name>     Package to release (${getAvailablePackageNames().join(', ')})
  -s, --since <ref>        Git ref to start from (commit, tag, branch) for first releases
  --dry-run                Preview changes without applying them
  -h, --help               Show this help message

Examples:
  pnpm tsx scripts/release/index.ts --package stagewise
  pnpm tsx scripts/release/index.ts --package karton --dry-run

  # First release - only include commits after a specific point
  pnpm tsx scripts/release/index.ts --package stagewise --since abc1234
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

  return {
    package: values.package,
    dryRun: values['dry-run'] ?? false,
    since: values.since,
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

  if (semver.prerelease(currentVersion)) {
    console.error(
      `\nError: Current version ${currentVersion} has a prerelease suffix.`,
    );
    console.error('Set package.json to the last stable version first.');
    process.exit(1);
  }

  // Compare against the last stable tag so nightly tags never shorten the
  // range of commits included in a release.
  const lastStableTag = await getLastStableTag(packageConfig.tagPrefix);
  console.log(`   Last stable tag: ${lastStableTag || 'none'}`);

  const sinceRef = options.since || lastStableTag;
  if (options.since) {
    console.log(`   Using --since: ${options.since}`);
  }

  // Get commits since last stable tag or specified ref
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
  if (!lastStableTag && !options.since) {
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

  const newVersion = semver.inc(currentVersion, bumpType);
  if (!newVersion) {
    console.error(
      `\nError: Failed to bump version ${currentVersion} with ${bumpType}`,
    );
    process.exit(1);
  }
  const newTag = `${packageConfig.tagPrefix}${newVersion}`;

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
