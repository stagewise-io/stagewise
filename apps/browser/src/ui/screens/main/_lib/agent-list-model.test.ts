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
      'Root',
      'feature',
    ]);
    expect(groups[0]?.severity).toBe('warning');
  });
});
