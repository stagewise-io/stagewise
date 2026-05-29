import { describe, expect, it } from 'vitest';
import { userPreferencesSchema } from './shared-types';

describe('userPreferencesSchema sidebar defaults', () => {
  it('defaults sidebar preferences when sidebar is missing', () => {
    const parsed = userPreferencesSchema.parse({});

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: [],
      agentListGroupingMode: 'age',
      workspaceGroupOrder: [],
      collapsedWorkspaceGroupKeys: [],
    });
  });

  it('defaults pinned agent ids for legacy sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { showActiveAgents: false },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: [],
      agentListGroupingMode: 'age',
      workspaceGroupOrder: [],
      collapsedWorkspaceGroupKeys: [],
    });
  });

  it('defaults active agents visibility when only pinned ids exist', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { pinnedAgentIds: ['agent-b', 'agent-a'] },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: ['agent-b', 'agent-a'],
      agentListGroupingMode: 'age',
      workspaceGroupOrder: [],
      collapsedWorkspaceGroupKeys: [],
    });
  });

  it('defaults invalid grouping mode values', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { agentListGroupingMode: 'invalid' },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: [],
      agentListGroupingMode: 'age',
      workspaceGroupOrder: [],
      collapsedWorkspaceGroupKeys: [],
    });
  });

  it('preserves complete sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: {
        showActiveAgents: false,
        pinnedAgentIds: ['agent-a'],
        agentListGroupingMode: 'workspace',
        workspaceGroupOrder: ['repo:b', 'repo:a'],
        collapsedWorkspaceGroupKeys: ['repo:a', 'repo:a:root'],
      },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: ['agent-a'],
      agentListGroupingMode: 'workspace',
      workspaceGroupOrder: ['repo:b', 'repo:a'],
      collapsedWorkspaceGroupKeys: ['repo:a', 'repo:a:root'],
    });
  });
});

describe('userPreferencesSchema worktree cleanup snooze defaults', () => {
  it('defaults worktree cleanup snoozes when missing', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceSettings: {},
        disabledModelIds: [],
        disabledPluginIds: [],
        workspaceGitActionPreferences: { general: {}, repositories: {} },
      },
    });

    expect(parsed.agent.workspaceGitCleanup).toEqual({
      dismissedCandidates: {},
    });
  });

  it('preserves valid worktree cleanup snoozes', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceGitCleanup: {
          dismissedCandidates: {
            '/worktree/a': { dismissedAt: 1710000000000 },
            '/worktree/b': { dismissedAt: 1710000001000 },
          },
        },
      },
    });

    expect(parsed.agent.workspaceGitCleanup).toEqual({
      dismissedCandidates: {
        '/worktree/a': { dismissedAt: 1710000000000 },
        '/worktree/b': { dismissedAt: 1710000001000 },
      },
    });
  });

  it('sanitizes invalid worktree cleanup snooze entries', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceGitCleanup: {
          dismissedCandidates: {
            '/worktree/a': { dismissedAt: 1710000000000 },
            '/worktree/b': { dismissedAt: 'invalid' },
            '/worktree/c': null,
          },
        },
      },
    });

    expect(parsed.agent.workspaceGitCleanup).toEqual({
      dismissedCandidates: {
        '/worktree/a': { dismissedAt: 1710000000000 },
      },
    });
  });
});

describe('userPreferencesSchema workspace Git action defaults', () => {
  it('defaults workspace Git action preferences when missing', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceSettings: {},
        disabledModelIds: [],
        disabledPluginIds: [],
      },
    });

    expect(parsed.agent.workspaceGitActionPreferences).toEqual({
      general: {},
      repositories: {},
    });
  });

  it('preserves valid workspace Git action preferences', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceGitActionPreferences: {
          general: { selectedAction: 'create-branch' },
          repositories: {
            '/repo/.git': {
              selectedAction: 'create-worktree',
              createWorktreeFrom: 'develop',
              createBranchFrom: 'release',
              switchWorktreeTarget: '/repo/worktrees/test',
            },
          },
        },
      },
    });

    expect(parsed.agent.workspaceGitActionPreferences).toEqual({
      general: { selectedAction: 'create-branch' },
      repositories: {
        '/repo/.git': {
          selectedAction: 'create-worktree',
          createWorktreeFrom: 'develop',
          createBranchFrom: 'release',
          switchWorktreeTarget: '/repo/worktrees/test',
        },
      },
    });
  });

  it('defaults invalid workspace Git action preference values', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceGitActionPreferences: {
          general: { selectedAction: 'invalid-action' },
          repositories: {
            '/repo/.git': { selectedAction: 'invalid-action' },
          },
        },
      },
    });

    expect(parsed.agent.workspaceGitActionPreferences).toEqual({
      general: {},
      repositories: {
        '/repo/.git': {},
      },
    });
  });
});
