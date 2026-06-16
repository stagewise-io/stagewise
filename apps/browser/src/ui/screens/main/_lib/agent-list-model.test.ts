import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceAgentGroups,
  getAgentStateSeverity,
  type MergedAgentEntry,
} from './agent-list-model';

function agent(
  id: string,
  overrides: Partial<MergedAgentEntry> = {},
): MergedAgentEntry {
  return {
    id,
    title: id,
    isWorking: false,
    isWaitingForUser: false,
    activityText: '',
    activityIsUserInput: false,
    hasError: false,
    lastMessageAt: 0,
    createdAt: 0,
    messageCount: 0,
    unread: false,
    mountedWorkspaces: [],
    isLive: true,
    ...overrides,
  };
}

describe('agent list workspace model', () => {
  it('orders state severity by error, waiting, unread, working', () => {
    expect(getAgentStateSeverity(agent('error', { hasError: true }))).toBe(
      'error',
    );
    expect(
      getAgentStateSeverity(agent('waiting', { isWaitingForUser: true })),
    ).toBe('warning');
    expect(getAgentStateSeverity(agent('unread', { unread: true }))).toBe(
      'success',
    );
    expect(getAgentStateSeverity(agent('working', { isWorking: true }))).toBe(
      'info',
    );
  });

  it('duplicates multi-workspace agents into each workspace group', () => {
    const groups = buildWorkspaceAgentGroups({
      entries: [
        agent('agent-a', {
          mountedWorkspaces: [
            { path: '/repo-a', git: null },
            { path: '/repo-b', git: null },
          ],
        }),
      ],
      pinnedIds: new Set(),
      worktreeLists: new Map(),
      groupOrder: { repoKeys: [], worktreeKeysByRepo: {} },
    });

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.directAgents[0]?.agent.id)).toEqual([
      'agent-a',
      'agent-a',
    ]);
  });

  it('keeps root worktree first and aggregates highest severity', () => {
    const groups = buildWorkspaceAgentGroups({
      entries: [
        agent('root', {
          unread: true,
          mountedWorkspaces: [
            {
              path: '/repo',
              git: {
                repositoryId: '/repo/.git',
                worktreeId: '/repo',
                repoRoot: '/repo',
                mainWorktreePath: '/repo',
                commonGitDir: '/repo/.git',
                isWorktree: false,
                branch: 'main',
                headSha: 'abc',
                status: {
                  dirty: false,
                  stagedCount: 0,
                  unstagedCount: 0,
                  untrackedCount: 0,
                },
              },
            },
          ],
        }),
        agent('feature', {
          isWaitingForUser: true,
          mountedWorkspaces: [
            {
              path: '/worktrees/feature',
              git: {
                repositoryId: '/repo/.git',
                worktreeId: '/worktrees/feature',
                repoRoot: '/worktrees/feature',
                mainWorktreePath: '/repo',
                commonGitDir: '/repo/.git',
                isWorktree: true,
                branch: 'feature',
                headSha: 'def',
                status: {
                  dirty: false,
                  stagedCount: 0,
                  unstagedCount: 0,
                  untrackedCount: 0,
                },
              },
            },
          ],
        }),
      ],
      pinnedIds: new Set(),
      worktreeLists: new Map(),
      groupOrder: { repoKeys: [], worktreeKeysByRepo: {} },
    });

    expect(groups[0]?.worktrees.map((group) => group.label)).toEqual([
      'Root (main)',
      'feature',
    ]);
    expect(groups[0]?.severity).toBe('warning');
  });

  it('orders worktrees root-first then newest-by-age from the git list', () => {
    // `git worktree list` order is filesystem/alphabetical, not age-based, so
    // the sidebar relies on the per-worktree `createdAt` timestamp instead.
    // It must show root first, then the remaining worktrees newest-first
    // regardless of git-list position or whether they have agents attached.
    const mkGit = (id: string, isMain: boolean) => ({
      repositoryId: '/repo/.git',
      worktreeId: id,
      repoRoot: id,
      mainWorktreePath: '/repo',
      commonGitDir: '/repo/.git',
      isWorktree: !isMain,
      branch: null,
      headSha: 'sha',
      status: {
        dirty: false,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
      },
    });
    const groups = buildWorkspaceAgentGroups({
      entries: [
        // Only the oldest non-root worktree has an agent. Age must still win.
        agent('old', {
          mountedWorkspaces: [
            { path: '/wt/old', git: mkGit('/wt/old', false) },
          ],
        }),
        agent('root', {
          mountedWorkspaces: [{ path: '/repo', git: mkGit('/repo', true) }],
        }),
      ],
      pinnedIds: new Set(),
      worktreeLists: new Map([
        [
          '/repo/.git',
          {
            currentPath: '/repo',
            worktrees: [
              // Arbitrary git-list order; createdAt (not position) drives sort.
              {
                worktreeId: '/repo',
                path: '/repo',
                branch: 'main',
                headSha: 'sha',
                isDetached: false,
                isMainWorktree: true,
                current: true,
                createdAt: 50,
              },
              {
                worktreeId: '/wt/old',
                path: '/wt/old',
                branch: 'old',
                headSha: 'sha',
                isDetached: false,
                isMainWorktree: false,
                current: false,
                createdAt: 100,
              },
              {
                worktreeId: '/wt/new',
                path: '/wt/new',
                branch: 'new',
                headSha: 'sha',
                isDetached: false,
                isMainWorktree: false,
                current: false,
                createdAt: 300,
              },
              {
                worktreeId: '/wt/mid',
                path: '/wt/mid',
                branch: 'mid',
                headSha: 'sha',
                isDetached: false,
                isMainWorktree: false,
                current: false,
                createdAt: 200,
              },
            ],
          },
        ],
      ]),
      groupOrder: { repoKeys: [], worktreeKeysByRepo: {} },
    });

    expect(groups[0]?.worktrees.map((group) => group.path)).toEqual([
      '/repo',
      '/wt/new',
      '/wt/mid',
      '/wt/old',
    ]);
  });

  it('overlays the freshly fetched worktree branch onto agent-derived groups', () => {
    // The agent mount captured `branch: 'feature'` at mount time. After an
    // external `git switch`, the HEAD watcher bumps the repo revision and the
    // worktree list is refetched with the new branch. The list must win so the
    // sidebar label tracks branch changes made outside the app.
    const groups = buildWorkspaceAgentGroups({
      entries: [
        agent('feature', {
          mountedWorkspaces: [
            {
              path: '/worktrees/feature',
              git: {
                repositoryId: '/repo/.git',
                worktreeId: '/worktrees/feature',
                repoRoot: '/worktrees/feature',
                mainWorktreePath: '/repo',
                commonGitDir: '/repo/.git',
                isWorktree: true,
                branch: 'feature',
                headSha: 'def',
                status: {
                  dirty: false,
                  stagedCount: 0,
                  unstagedCount: 0,
                  untrackedCount: 0,
                },
              },
            },
          ],
        }),
      ],
      pinnedIds: new Set(),
      worktreeLists: new Map([
        [
          '/repo/.git',
          {
            currentPath: '/worktrees/feature',
            worktrees: [
              {
                worktreeId: '/worktrees/feature',
                path: '/worktrees/feature',
                branch: 'feature-renamed',
                headSha: 'def',
                isDetached: false,
                isMainWorktree: false,
                current: true,
                createdAt: 1000,
              },
            ],
          },
        ],
      ]),
      groupOrder: { repoKeys: [], worktreeKeysByRepo: {} },
    });

    const worktree = groups[0]?.worktrees[0];
    expect(worktree?.branch).toBe('feature-renamed');
    expect(worktree?.label).toBe('feature (feature-renamed)');
    // The agent stays attached to the (now relabeled) group.
    expect(worktree?.agents.map((row) => row.agent.id)).toEqual(['feature']);
  });
});
