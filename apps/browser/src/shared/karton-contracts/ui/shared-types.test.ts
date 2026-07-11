import { describe, expect, it } from 'vitest';
import {
  providerConfigSchema,
  providerInstanceSchema,
  customModelSchema,
  userPreferencesSchema,
} from './shared-types';

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

describe('providerConfigSchema connected coding plan defaults', () => {
  it('preserves legacy provider configs without connected coding plan ids', () => {
    const parsed = providerConfigSchema.parse({ mode: 'official' });

    expect(parsed).toEqual({ mode: 'official' });
  });

  it('preserves valid connected coding plan ids', () => {
    const parsed = providerConfigSchema.parse({
      mode: 'official',
      encryptedApiKey: 'encrypted-key',
      connectedCodingPlanId: 'glm-coding-plan',
    });

    expect(parsed.connectedCodingPlanId).toBe('glm-coding-plan');
  });

  it('sanitizes invalid connected coding plan ids', () => {
    const parsed = providerConfigSchema.parse({
      mode: 'official',
      connectedCodingPlanId: 'unknown-plan',
    });

    expect(parsed.connectedCodingPlanId).toBeUndefined();
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

describe('userPreferencesSchema model thinking override defaults', () => {
  it('defaults model thinking overrides when missing', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        workspaceSettings: {},
        disabledModelIds: [],
        disabledPluginIds: [],
        workspaceGitActionPreferences: { general: {}, repositories: {} },
        workspaceGitCleanup: { dismissedCandidates: {} },
      },
    });

    expect(parsed.agent.modelThinkingOverrides).toEqual({});
  });

  it('preserves valid model thinking overrides', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        modelThinkingOverrides: {
          'stagewise-default': {
            'gpt-5.5': { enabled: true, provider: 'openai', value: 'high' },
            'claude-opus-4.8': { enabled: false, provider: 'anthropic' },
          },
        },
      },
    });

    expect(parsed.agent.modelThinkingOverrides).toEqual({
      'stagewise-default': {
        'gpt-5.5': { enabled: true, provider: 'openai', value: 'high' },
        'claude-opus-4.8': { enabled: false, provider: 'anthropic' },
      },
    });
  });

  it('sanitizes invalid model thinking override entries field-by-field', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        modelThinkingOverrides: {
          'stagewise-default': {
            'gpt-5.5': { enabled: true, provider: 'invalid', value: 'high' },
            'claude-opus-4.8': { enabled: 'nope', provider: 'anthropic' },
            'gemini-3.1-pro-preview': null,
          },
        },
      },
    });

    expect(parsed.agent.modelThinkingOverrides).toEqual({
      'stagewise-default': {
        'gpt-5.5': { enabled: true, value: 'high' },
        'claude-opus-4.8': { provider: 'anthropic' },
        'gemini-3.1-pro-preview': {},
      },
    });
  });

  it('wraps legacy flat modelThinkingOverrides under stagewise-default', () => {
    const parsed = userPreferencesSchema.parse({
      agent: {
        modelThinkingOverrides: {
          'gpt-5.5': { enabled: true, provider: 'openai', value: 'high' },
          'claude-opus-4.8': { enabled: false, provider: 'anthropic' },
        },
      },
    });

    expect(parsed.agent.modelThinkingOverrides).toEqual({
      'stagewise-default': {
        'gpt-5.5': { enabled: true, provider: 'openai', value: 'high' },
        'claude-opus-4.8': { enabled: false, provider: 'anthropic' },
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

describe('providerInstanceSchema validation', () => {
  it('parses a valid stagewise instance', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'stagewise-default',
      typeId: 'stagewise',
      name: 'Stagewise Inference',
      config: {},
    });
    expect(parsed.typeId).toBe('stagewise');
    expect(parsed.config).toEqual({});
    expect(parsed.enabledModelIds).toEqual([]);
    expect(parsed.discoveredModels).toEqual([]);
  });

  it('parses a valid anthropic-api instance with encrypted key and baseUrl', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'anthropic-api-default',
      typeId: 'anthropic-api',
      name: 'Anthropic',
      config: {
        encryptedApiKey: 'enc-key',
        baseUrl: 'https://custom.anthropic.com',
      },
    });
    expect(parsed.typeId).toBe('anthropic-api');
    if (parsed.typeId === 'anthropic-api') {
      expect(parsed.config.encryptedApiKey).toBe('enc-key');
      expect(parsed.config.baseUrl).toBe('https://custom.anthropic.com');
    }
  });

  it('parses a valid coding-plan instance', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'coding-plan:glm-coding-plan',
      typeId: 'coding-plan',
      name: 'GLM Coding Plan',
      config: {
        encryptedApiKey: 'enc-key',
        planId: 'glm-coding-plan',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      },
    });
    expect(parsed.typeId).toBe('coding-plan');
    if (parsed.typeId === 'coding-plan') {
      expect(parsed.config.planId).toBe('glm-coding-plan');
    }
  });

  it('parses a valid custom-openai-chat instance with modelIdMapping', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'my-openai-proxy',
      typeId: 'custom-openai-chat',
      name: 'My Proxy',
      config: {
        baseUrl: 'https://proxy.example.com/v1',
        encryptedApiKey: 'enc-key',
        modelIdMapping: { 'gpt-5.5': 'gpt-custom' },
      },
    });
    expect(parsed.typeId).toBe('custom-openai-chat');
    if (parsed.typeId === 'custom-openai-chat') {
      expect(parsed.config.baseUrl).toBe('https://proxy.example.com/v1');
      expect(parsed.config.modelIdMapping).toEqual({ 'gpt-5.5': 'gpt-custom' });
    }
  });

  it('parses a valid bedrock instance with awsAuthMode defaulting to access-keys', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'bedrock-prod',
      typeId: 'bedrock',
      name: 'Bedrock Prod',
      config: {
        encryptedApiKey: 'enc-key',
        encryptedSecretKey: 'enc-secret',
        region: 'us-east-1',
      },
    });
    expect(parsed.typeId).toBe('bedrock');
    if (parsed.typeId === 'bedrock') {
      expect(parsed.config.awsAuthMode).toBe('access-keys');
      expect(parsed.config.region).toBe('us-east-1');
    }
  });

  it('parses a valid vertex instance', () => {
    const parsed = providerInstanceSchema.parse({
      id: 'vertex-prod',
      typeId: 'vertex',
      name: 'Vertex Prod',
      config: {
        projectId: 'my-project',
        location: 'us-central1',
        encryptedGoogleCredentials: 'enc-creds',
      },
    });
    expect(parsed.typeId).toBe('vertex');
    if (parsed.typeId === 'vertex') {
      expect(parsed.config.projectId).toBe('my-project');
      expect(parsed.config.location).toBe('us-central1');
    }
  });

  it('rejects an unknown typeId', () => {
    expect(
      providerInstanceSchema.safeParse({
        id: 'unknown',
        typeId: 'nonexistent-type',
        name: 'Unknown',
        config: {},
      }).success,
    ).toBe(false);
  });

  it('rejects a custom-openai-chat config missing required baseUrl', () => {
    expect(
      providerInstanceSchema.safeParse({
        id: 'bad',
        typeId: 'custom-openai-chat',
        name: 'Bad',
        config: { encryptedApiKey: 'key' },
      }).success,
    ).toBe(false);
  });

  it('rejects a coding-plan config missing required planId', () => {
    expect(
      providerInstanceSchema.safeParse({
        id: 'bad',
        typeId: 'coding-plan',
        name: 'Bad',
        config: { encryptedApiKey: 'key' },
      }).success,
    ).toBe(false);
  });
});

describe('customModelSchema providerInstanceId migration', () => {
  it('accepts providerInstanceId', () => {
    const parsed = customModelSchema.parse({
      modelId: 'my-model',
      displayName: 'My Model',
      providerInstanceId: 'anthropic-api-default',
    });
    expect(parsed.providerInstanceId).toBe('anthropic-api-default');
  });

  it('still accepts legacy endpointId for migration compat', () => {
    const parsed = customModelSchema.parse({
      modelId: 'my-model',
      displayName: 'My Model',
      endpointId: 'some-endpoint-id',
    });
    expect(parsed.endpointId).toBe('some-endpoint-id');
  });

  it('accepts both providerInstanceId and endpointId', () => {
    const parsed = customModelSchema.parse({
      modelId: 'my-model',
      displayName: 'My Model',
      providerInstanceId: 'instance-1',
      endpointId: 'endpoint-1',
    });
    expect(parsed.providerInstanceId).toBe('instance-1');
    expect(parsed.endpointId).toBe('endpoint-1');
  });
});

describe('userPreferencesSchema providerInstances', () => {
  it('defaults providerInstances to empty array when missing', () => {
    const parsed = userPreferencesSchema.parse({});
    expect(parsed.providerInstances).toEqual([]);
  });

  it('preserves providerInstances in parsed preferences', () => {
    const parsed = userPreferencesSchema.parse({
      providerInstances: [
        {
          id: 'stagewise-default',
          typeId: 'stagewise',
          name: 'Stagewise Inference',
          config: {},
        },
        {
          id: 'anthropic-api-default',
          typeId: 'anthropic-api',
          name: 'Anthropic',
          config: { encryptedApiKey: 'key' },
        },
      ],
    });
    expect(parsed.providerInstances).toHaveLength(2);
    expect(parsed.providerInstances[1]?.typeId).toBe('anthropic-api');
  });
});
