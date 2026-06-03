import { describe, expect, it } from 'vitest';
import {
  generateWorktreeName,
  getBranchSelectItemsFromGit,
  getCurrentBranchValue,
  getDefaultBranchValue,
  getDefaultSourceBranchValue,
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

describe('getCurrentBranchValue', () => {
  it('uses the backend current branch when available', () => {
    expect(
      getCurrentBranchValue(
        {
          current: 'feature/login',
          defaultBranch: 'develop',
          defaultRemoteBranch: 'origin/develop',
          branches: [],
        },
        'develop',
      ),
    ).toBe('feature/login');
  });

  it('falls back to the mounted git ref when current branch is unavailable', () => {
    expect(
      getCurrentBranchValue(
        {
          current: null,
          defaultBranch: 'main',
          defaultRemoteBranch: 'origin/main',
          branches: [],
        },
        'develop',
      ),
    ).toBe('develop');
  });

  it('falls back to the default branch when no current branch or git ref exists', () => {
    expect(
      getCurrentBranchValue(
        {
          current: null,
          defaultBranch: 'develop',
          defaultRemoteBranch: 'origin/develop',
          branches: [],
        },
        null,
      ),
    ).toBe('develop');
  });

  it('falls back to main when no branch data or git ref is available', () => {
    expect(getCurrentBranchValue(null, null)).toBe('main');
  });
});

describe('getBranchSelectItemsFromGit', () => {
  it('preserves the current ref when branch results omit it', () => {
    expect(
      getBranchSelectItemsFromGit(
        {
          current: 'detached-ref',
          defaultBranch: 'main',
          defaultRemoteBranch: 'origin/main',
          branches: [
            {
              name: 'main',
              kind: 'local',
              current: false,
              checkedOut: false,
            },
          ],
        },
        null,
        'source',
      ).map((item) => item.value),
    ).toEqual(['main', 'detached-ref']);
  });

  it('preserves the fallback ref when branch results omit it', () => {
    expect(
      getBranchSelectItemsFromGit(
        {
          current: null,
          defaultBranch: 'main',
          defaultRemoteBranch: 'origin/main',
          branches: [
            {
              name: 'main',
              kind: 'local',
              current: false,
              checkedOut: false,
            },
          ],
        },
        'fallback-ref',
        'source',
      ).map((item) => item.value),
    ).toEqual(['main', 'fallback-ref']);
  });

  it('groups source branches by local and remote name', () => {
    expect(
      getBranchSelectItemsFromGit(
        {
          current: 'main',
          defaultBranch: 'main',
          defaultRemoteBranch: 'origin/main',
          branches: [
            {
              name: 'main',
              kind: 'local',
              current: true,
              checkedOut: true,
            },
            {
              name: 'origin/main',
              kind: 'remote',
              remoteName: 'origin',
              remoteBranchName: 'main',
              current: false,
              checkedOut: false,
            },
            {
              name: 'upstream/main',
              kind: 'remote',
              remoteName: 'upstream',
              remoteBranchName: 'main',
              current: false,
              checkedOut: false,
            },
          ],
        },
        null,
        'source',
      ).map((item) => ({
        value: item.value,
        label: item.label,
        triggerLabel: item.triggerLabel,
        group: item.group,
      })),
    ).toEqual([
      {
        value: 'main',
        label: 'main',
        triggerLabel: 'main',
        group: 'Local',
      },
      {
        value: 'origin/main',
        label: 'main',
        triggerLabel: 'origin/main',
        group: 'origin',
      },
      {
        value: 'upstream/main',
        label: 'main',
        triggerLabel: 'upstream/main',
        group: 'upstream',
      },
    ]);
  });

  it('excludes remote branches from checkout choices', () => {
    expect(
      getBranchSelectItemsFromGit(
        {
          current: 'main',
          defaultBranch: 'main',
          defaultRemoteBranch: 'origin/main',
          branches: [
            {
              name: 'main',
              kind: 'local',
              current: true,
              checkedOut: true,
            },
            {
              name: 'origin/main',
              kind: 'remote',
              remoteName: 'origin',
              remoteBranchName: 'main',
              current: false,
              checkedOut: false,
            },
          ],
        },
        null,
        'checkout-target',
      ).map((item) => item.value),
    ).toEqual(['main']);
  });
});

describe('getDefaultBranchValue', () => {
  it('uses the backend default branch when available', () => {
    expect(
      getDefaultBranchValue(
        {
          current: 'feature/login',
          defaultBranch: 'develop',
          defaultRemoteBranch: 'origin/develop',
          branches: [],
        },
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

describe('getDefaultSourceBranchValue', () => {
  it('prefers the default remote branch for source branch selection', () => {
    expect(
      getDefaultSourceBranchValue(
        {
          current: 'feature/login',
          defaultBranch: 'develop',
          defaultRemoteBranch: 'origin/develop',
          branches: [],
        },
        'feature/login',
      ),
    ).toBe('origin/develop');
  });

  it('falls back to the default local branch when no remote branch exists', () => {
    expect(
      getDefaultSourceBranchValue(
        {
          current: 'feature/login',
          defaultBranch: 'develop',
          defaultRemoteBranch: null,
          branches: [],
        },
        'feature/login',
      ),
    ).toBe('develop');
  });
});
