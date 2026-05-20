import { describe, expect, it } from 'vitest';
import {
  generateWorktreeName,
  getDefaultBranchValue,
  WORKTREE_NAME_ADJECTIVES,
  WORKTREE_NAME_NOUNS,
} from './worktree-utils';

describe('generateWorktreeName', () => {
  it('generates lowercase adjective-noun names from the curated wordbank', () => {
    const name = generateWorktreeName({ random: () => 0 });
    if (!name) throw new Error('Expected generated name');

    expect(name).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);

    const [adjective, noun] = name.split('-');
    expect(WORKTREE_NAME_ADJECTIVES).toContain(adjective);
    expect(WORKTREE_NAME_NOUNS).toContain(noun);
  });

  it('avoids reserved names when alternatives exist', () => {
    const firstName = `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[0]}`;

    const name = generateWorktreeName({
      reservedNames: [firstName],
      random: () => 0,
    });

    expect(name).not.toBe(firstName);
    expect(name).toBe(
      `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[1]}`,
    );
  });

  it('matches reserved names case-insensitively', () => {
    const firstName = `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[0]}`;

    const name = generateWorktreeName({
      reservedNames: [firstName.toUpperCase()],
      random: () => 0,
    });

    expect(name).not.toBe(firstName);
    expect(name).toBe(
      `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[1]}`,
    );
  });

  it('uses the deterministic fallback scan when random attempts collide', () => {
    const randomName = `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[0]}`;
    const firstFallbackName = `${WORKTREE_NAME_ADJECTIVES[0]}-${WORKTREE_NAME_NOUNS[1]}`;

    const name = generateWorktreeName({
      reservedNames: [randomName],
      random: () => 0,
    });

    expect(name).toBe(firstFallbackName);
  });

  it('returns undefined when every curated name is reserved', () => {
    const reservedNames = WORKTREE_NAME_ADJECTIVES.flatMap((adj) =>
      WORKTREE_NAME_NOUNS.map((noun) => `${adj}-${noun}`),
    );

    expect(generateWorktreeName({ reservedNames })).toBeUndefined();
  });
});

describe('getDefaultBranchValue', () => {
  it('uses the backend default branch when available', () => {
    expect(
      getDefaultBranchValue(
        { current: 'feature/login', defaultBranch: 'develop', branches: [] },
        'feature/login',
      ),
    ).toBe('develop');
  });

  it('falls back to the mounted git ref before main', () => {
    expect(getDefaultBranchValue(null, 'develop')).toBe('develop');
  });

  it('falls back to main when no branch data or git ref is available', () => {
    expect(getDefaultBranchValue(null, null)).toBe('main');
  });
});
