/**
 * Changelog generation from conventional commits
 */

import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type {
  ConventionalCommit,
  PackageConfig,
  ReleaseChannel,
} from './types.js';
import { getRepoRoot } from './git-utils.js';
import { parseVersion } from './bump-version.js';

/**
 * Get the path to release notes file for a package
 */
export async function getReleaseNotesPath(
  packageName: string,
): Promise<string> {
  const repoRoot = await getRepoRoot();
  return path.join(repoRoot, '.release-notes', `${packageName}.md`);
}

/**
 * Read custom release notes for a package
 * Returns null if no release notes file exists
 */
export async function readReleaseNotes(
  packageName: string,
): Promise<string | null> {
  const notesPath = await getReleaseNotesPath(packageName);

  if (!existsSync(notesPath)) {
    return null;
  }

  const content = await readFile(notesPath, 'utf-8');
  return content.trim() || null;
}

/**
 * Delete the release notes file after it's been used
 */
export async function deleteReleaseNotes(packageName: string): Promise<void> {
  const notesPath = await getReleaseNotesPath(packageName);

  if (existsSync(notesPath)) {
    await unlink(notesPath);
  }
}

/**
 * Group commits by type for changelog sections
 */
interface GroupedCommits {
  features: ConventionalCommit[];
  fixes: ConventionalCommit[];
  breaking: ConventionalCommit[];
  other: ConventionalCommit[];
}

function groupCommitsByType(commits: ConventionalCommit[]): GroupedCommits {
  return {
    features: commits.filter((c) => c.type === 'feat'),
    fixes: commits.filter((c) => c.type === 'fix'),
    breaking: commits.filter((c) => c.breaking),
    other: commits.filter(
      (c) => !['feat', 'fix'].includes(c.type) && !c.breaking,
    ),
  };
}

/**
 * Generate markdown for a single commit
 */
function formatCommit(commit: ConventionalCommit): string {
  const breaking = commit.breaking ? '**BREAKING** ' : '';
  return `* ${breaking}${commit.subject} (${commit.shortHash})`;
}

/**
 * Generate the changelog markdown for a new version
 */
export function generateChangelogMarkdown(
  version: string,
  commits: ConventionalCommit[],
  date: Date = new Date(),
  customNotes: string | null = null,
): string {
  const dateStr = date.toISOString().split('T')[0];
  const { features, fixes, breaking, other } = groupCommitsByType(commits);

  let markdown = `## ${version} (${dateStr})\n\n`;

  // Add custom release notes at the top if provided
  if (customNotes) {
    markdown += `${customNotes}\n\n`;
  }

  // Breaking changes section
  if (breaking.length > 0) {
    markdown += `### Breaking Changes\n\n`;
    for (const commit of breaking) {
      markdown += `${formatCommit(commit)}\n`;
      if (commit.breakingDescription) {
        markdown += `  - ${commit.breakingDescription}\n`;
      }
    }
    markdown += '\n';
  }

  // Features section
  if (features.length > 0) {
    markdown += `### Features\n\n`;
    for (const commit of features) {
      if (!commit.breaking) {
        markdown += `${formatCommit(commit)}\n`;
      }
    }
    markdown += '\n';
  }

  // Bug fixes section
  if (fixes.length > 0) {
    markdown += `### Bug Fixes\n\n`;
    for (const commit of fixes) {
      if (!commit.breaking) {
        markdown += `${formatCommit(commit)}\n`;
      }
    }
    markdown += '\n';
  }

  // Other changes section (perf, refactor, etc.)
  const significantOther = other.filter((c) =>
    ['perf', 'refactor'].includes(c.type),
  );
  if (significantOther.length > 0) {
    markdown += `### Other Changes\n\n`;
    for (const commit of significantOther) {
      markdown += `${formatCommit(commit)}\n`;
    }
    markdown += '\n';
  }

  return markdown;
}

/**
 * Read existing changelog or return header
 */
async function readExistingChangelog(changelogPath: string): Promise<string> {
  if (existsSync(changelogPath)) {
    return await readFile(changelogPath, 'utf-8');
  }
  return '';
}

/**
 * Prepend new changelog entry to existing changelog
 */
export async function prependToChangelog(
  packageConfig: PackageConfig,
  newEntry: string,
): Promise<void> {
  const repoRoot = await getRepoRoot();
  const packageDir = path.dirname(path.join(repoRoot, packageConfig.path));
  const changelogPath = path.join(packageDir, 'CHANGELOG.md');

  const existing = await readExistingChangelog(changelogPath);

  // Check if changelog has a header
  const hasHeader = existing.startsWith('# Changelog');

  let newContent: string;
  if (hasHeader) {
    // Insert after the header line
    const headerEnd = existing.indexOf('\n\n');
    if (headerEnd !== -1) {
      newContent =
        existing.slice(0, headerEnd + 2) +
        newEntry +
        existing.slice(headerEnd + 2);
    } else {
      newContent = `${existing}\n\n${newEntry}`;
    }
  } else if (existing) {
    // No header, just prepend
    newContent = newEntry + existing;
  } else {
    // Empty file, create with header
    newContent = `# Changelog\n\nAll notable changes to this package will be documented in this file.\n\n${newEntry}`;
  }

  await writeFile(changelogPath, newContent, 'utf-8');
}

/**
 * Consolidate prerelease entries when releasing
 * Finds all alpha/beta entries for the same base version and merges them
 */
export async function consolidatePrereleaseEntries(
  packageConfig: PackageConfig,
  releaseVersion: string,
  commits: ConventionalCommit[],
  customNotes: string | null = null,
): Promise<string> {
  const repoRoot = await getRepoRoot();
  const packageDir = path.dirname(path.join(repoRoot, packageConfig.path));
  const changelogPath = path.join(packageDir, 'CHANGELOG.md');

  const existing = await readExistingChangelog(changelogPath);

  if (!existing) {
    // No existing changelog, just generate new entry
    return generateChangelogMarkdown(
      releaseVersion,
      commits,
      new Date(),
      customNotes,
    );
  }

  // Find all prerelease entries for this version
  const parsed = parseVersion(releaseVersion);
  const baseVersion = parsed.base;

  // Regex to match prerelease versions of the same base
  const prereleasePattern = new RegExp(
    `## ${escapeRegex(baseVersion)}-(alpha|beta)\\.\\d+[^#]*`,
    'g',
  );

  // Remove prerelease entries from existing changelog
  const cleanedChangelog = existing.replace(prereleasePattern, '');

  // Generate consolidated release entry
  const releaseEntry = generateChangelogMarkdown(
    releaseVersion,
    commits,
    new Date(),
    customNotes,
  );

  // Reconstruct changelog
  const hasHeader = cleanedChangelog.startsWith('# Changelog');
  let newContent: string;

  if (hasHeader) {
    const headerEnd = cleanedChangelog.indexOf('\n\n');
    if (headerEnd !== -1) {
      newContent =
        cleanedChangelog.slice(0, headerEnd + 2) +
        releaseEntry +
        cleanedChangelog.slice(headerEnd + 2);
    } else {
      newContent = `${cleanedChangelog}\n\n${releaseEntry}`;
    }
  } else {
    newContent = releaseEntry + cleanedChangelog;
  }

  await writeFile(changelogPath, `${newContent.trim()}\n`, 'utf-8');

  return releaseEntry;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update changelog for a new release
 */
export async function updateChangelog(
  packageConfig: PackageConfig,
  newVersion: string,
  targetChannel: ReleaseChannel,
  commits: ConventionalCommit[],
  customNotes: string | null = null,
): Promise<string> {
  // For stable releases, consolidate any prerelease entries
  if (targetChannel === 'release') {
    return await consolidatePrereleaseEntries(
      packageConfig,
      newVersion,
      commits,
      customNotes,
    );
  }

  // For prerelease, just prepend the new entry
  const entry = generateChangelogMarkdown(
    newVersion,
    commits,
    new Date(),
    customNotes,
  );
  await prependToChangelog(packageConfig, entry);
  return entry;
}
