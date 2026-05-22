import { describe, expect, it } from 'vitest';
import { userPreferencesSchema } from './shared-types';

describe('userPreferencesSchema sidebar defaults', () => {
  it('defaults sidebar preferences when sidebar is missing', () => {
    const parsed = userPreferencesSchema.parse({});

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: [],
    });
  });

  it('defaults pinned agent ids for legacy sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { showActiveAgents: false },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: [],
    });
  });

  it('defaults active agents visibility when only pinned ids exist', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { pinnedAgentIds: ['agent-b', 'agent-a'] },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: true,
      pinnedAgentIds: ['agent-b', 'agent-a'],
    });
  });

  it('preserves complete sidebar preferences', () => {
    const parsed = userPreferencesSchema.parse({
      sidebar: { showActiveAgents: false, pinnedAgentIds: ['agent-a'] },
    });

    expect(parsed.sidebar).toEqual({
      showActiveAgents: false,
      pinnedAgentIds: ['agent-a'],
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
