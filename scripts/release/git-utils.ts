/**
 * Git utility functions for release management
 */

import { exec as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import type { ConventionalCommit } from './types.js';

const exec = promisify(execCallback);

/**
 * Get the most recent tag matching a prefix
 */
export async function getLastTag(prefix: string): Promise<string | null> {
  try {
    const { stdout } = await exec(
      `git tag --list "${prefix}*" --sort=-version:refname | head -n 1`,
    );
    const tag = stdout.trim();
    return tag || null;
  } catch {
    return null;
  }
}

/**
 * Get all commits since a given tag (or all commits if no tag)
 */
export async function getCommitsSince(
  sinceTag: string | null,
  scope: string,
): Promise<ConventionalCommit[]> {
  const range = sinceTag ? `${sinceTag}..HEAD` : '';

  try {
    // Get commits with full details
    // Format: hash|subject|body (using | as delimiter since it's unlikely in commits)
    const { stdout } = await exec(
      `git log ${range} --format="%H|%s|%b|||" --no-merges`,
    );

    if (!stdout.trim()) {
      return [];
    }

    const commits: ConventionalCommit[] = [];

    // Split by ||| delimiter (end of each commit)
    const rawCommits = stdout.split('|||').filter((c) => c.trim());

    for (const rawCommit of rawCommits) {
      const parts = rawCommit.trim().split('|');
      if (parts.length < 2) continue;

      const hash = parts[0];
      const subject = parts[1];
      const body = parts.slice(2).join('|').trim() || null;

      // Skip if hash or subject are missing
      if (!hash || !subject) continue;

      // Parse conventional commit format: type(scope): subject
      const conventionalMatch = subject.match(
        /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/,
      );

      if (!conventionalMatch) continue;

      const [, type, commitScope, breakingMark, description] =
        conventionalMatch;

      // Skip if type or description are missing
      if (!type || !description) continue;

      // Only include commits matching the requested scope
      if (commitScope !== scope) continue;

      // Check for breaking changes
      const breaking =
        breakingMark === '!' || body?.includes('BREAKING CHANGE:') || false;
      const breakingDescription =
        breaking && body
          ? body.match(/BREAKING CHANGE:\s*(.+)/)?.[1] || null
          : null;

      commits.push({
        hash,
        shortHash: hash.slice(0, 7),
        type,
        scope: commitScope || null,
        subject: description,
        body,
        breaking,
        breakingDescription,
      });
    }

    return commits;
  } catch (error) {
    console.error('Error getting commits:', error);
    return [];
  }
}

/**
 * Get the recommended version bump based on commits
 */
export function getRecommendedBump(
  commits: ConventionalCommit[],
): 'major' | 'minor' | 'patch' | null {
  if (commits.length === 0) {
    return null;
  }

  // Check for breaking changes first
  if (commits.some((c) => c.breaking)) {
    return 'major';
  }

  // Check for features
  if (commits.some((c) => c.type === 'feat')) {
    return 'minor';
  }

  // Check for fixes or other changes
  if (commits.some((c) => ['fix', 'perf', 'refactor'].includes(c.type))) {
    return 'patch';
  }

  // For other types (docs, style, test, chore), return patch as fallback
  return 'patch';
}

/**
 * Check if there are any uncommitted changes
 */
export async function hasUncommittedChanges(): Promise<boolean> {
  try {
    const { stdout } = await exec('git status --porcelain');
    return stdout.trim().length > 0;
  } catch {
    return true;
  }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  const { stdout } = await exec('git rev-parse --abbrev-ref HEAD');
  return stdout.trim();
}

/**
 * Create a git tag
 */
export async function createTag(
  tagName: string,
  message: string,
): Promise<void> {
  await exec(`git tag -a "${tagName}" -m "${message}"`);
}

/**
 * Push a tag to remote
 */
export async function pushTag(tagName: string): Promise<void> {
  await exec(`git push origin "${tagName}"`);
}

/**
 * Get the repo root directory
 */
export async function getRepoRoot(): Promise<string> {
  const { stdout } = await exec('git rev-parse --show-toplevel');
  return stdout.trim();
}
