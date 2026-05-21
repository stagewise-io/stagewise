import type { SelectItem } from '@stagewise/stage-ui/components/select';
import type {
  WorkspaceGitBranchesResult,
  WorkspaceGitWorktreesResult,
} from '@shared/karton-contracts/ui';
import { getBaseName } from '@shared/path-utils';
export {
  WORKTREE_NAME_ADJECTIVES,
  WORKTREE_NAME_NOUNS,
} from './worktree-name-wordbank';
import {
  WORKTREE_NAME_ADJECTIVES,
  WORKTREE_NAME_NOUNS,
} from './worktree-name-wordbank';

const WORKTREE_NAME_RANDOM_ATTEMPTS = 20;

type GenerateWorktreeNameOptions = {
  reservedNames?: Iterable<string | null | undefined>;
  random?: () => number;
};

function normalizeReservedWorktreeName(
  name: string | null | undefined,
): string | null {
  const trimmed = name?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function createReservedWorktreeNameSet(
  reservedNames: Iterable<string | null | undefined> | undefined,
): Set<string> {
  const reserved = new Set<string>();
  for (const name of Array.from(reservedNames ?? [])) {
    const normalized = normalizeReservedWorktreeName(name);
    if (normalized) reserved.add(normalized);
  }
  return reserved;
}

function getRandomWorktreeName(random: () => number): string {
  const adj =
    WORKTREE_NAME_ADJECTIVES[
      Math.floor(random() * WORKTREE_NAME_ADJECTIVES.length)
    ];
  const noun =
    WORKTREE_NAME_NOUNS[Math.floor(random() * WORKTREE_NAME_NOUNS.length)];
  return `${adj}-${noun}`;
}

export function generateWorktreeName(
  options: GenerateWorktreeNameOptions = {},
): string | undefined {
  const reserved = createReservedWorktreeNameSet(options.reservedNames);
  const random = options.random ?? Math.random;

  for (let attempt = 0; attempt < WORKTREE_NAME_RANDOM_ATTEMPTS; attempt++) {
    const name = getRandomWorktreeName(random);
    if (!reserved.has(name)) return name;
  }

  for (const adj of WORKTREE_NAME_ADJECTIVES) {
    for (const noun of WORKTREE_NAME_NOUNS) {
      const name = `${adj}-${noun}`;
      if (!reserved.has(name)) return name;
    }
  }

  return undefined;
}

export type BranchSelectIntent = 'source' | 'checkout-target';

export function getBranchSelectItems(
  gitRef: string | null,
): SelectItem<string>[] {
  return Array.from(
    new Set(
      ['main', gitRef, 'develop'].filter(
        (branch): branch is string => typeof branch === 'string',
      ),
    ),
  ).map((branch) => ({ value: branch, label: branch }));
}

export function getDefaultBranchValue(
  result: WorkspaceGitBranchesResult | null,
  fallbackGitRef: string | null,
): string {
  return result?.defaultBranch ?? fallbackGitRef ?? 'main';
}

export function getCurrentBranchValue(
  result: WorkspaceGitBranchesResult | null,
  fallbackGitRef: string | null,
): string {
  return (
    result?.current ?? fallbackGitRef ?? getDefaultBranchValue(result, null)
  );
}

export function getBranchSelectItemsFromGit(
  result: WorkspaceGitBranchesResult | null,
  fallbackGitRef: string | null,
  intent: BranchSelectIntent,
): SelectItem<string>[] {
  if (!result) return getBranchSelectItems(fallbackGitRef);

  const branches = result.branches.map((branch) => ({
    value: branch.name,
    label: branch.name,
    disabled:
      intent === 'checkout-target' && branch.checkedOut && !branch.current,
  }));

  if (branches.length > 0) return branches;
  return getBranchSelectItems(result.current ?? fallbackGitRef);
}

export function getWorktreeSelectItemsFromGit(
  result: WorkspaceGitWorktreesResult | null,
): SelectItem<string>[] {
  if (!result) return getWorktreeSelectItems();

  return result.worktrees.map((worktree) => {
    const label = getBaseName(worktree.path) ?? worktree.path;
    return {
      value: worktree.path,
      label,
      triggerLabel: label,
    };
  });
}

/**
 * Fallback worktree choices used before live Git worktree data is loaded.
 * Mounted workspace actions and recent-workspace connect actions replace
 * these items with backend data when a path or mount prefix is available.
 */
export function getWorktreeSelectItems(): SelectItem<string>[] {
  return [
    { value: 'main', label: 'main' },
    { value: 'experiments-1', label: 'experiments-1' },
    { value: 'hotfix-auth', label: 'hotfix-auth' },
  ];
}
