import { describe, expect, it, vi } from 'vitest';
import {
  defaultUserPreferences,
  type ProviderInstance,
  type CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import { MODEL_REQUEST_PURPOSE_METADATA_KEY } from '@stagewise/agent-core/host';
import { ModelProviderService } from './model-provider';
import {
  reasoningSignatureSourceSchema,
  type ReasoningSignatureSource,
} from '@shared/karton-contracts/ui/agent/metadata';
import {
  createReasoningSignatureSource,
  getSemanticProviderForApiSpec,
  reasoningSourcesMatch,
} from './reasoning-signatures';
import { CODING_PLANS } from '@shared/coding-plans';

/**
 * Build a `ProviderInstance` for a custom-type endpoint.  Reuses the
 * endpoint's `id` so that legacy `providerConfigs[vendor].customProviderId`
 * links resolve correctly during the PR 1 hybrid routing.
 */
function customEndpointToInstance(ep: CustomEndpoint): ProviderInstance {
  const apiSpecToTypeId: Record<string, ProviderInstance['typeId']> = {
    anthropic: 'custom-anthropic',
    'openai-chat-completions': 'custom-openai-chat',
    'openai-responses': 'custom-openai-responses',
    google: 'custom-google',
    azure: 'azure',
    'amazon-bedrock': 'bedrock',
    'google-vertex': 'vertex',
  };
  const typeId = apiSpecToTypeId[ep.apiSpec];
  const base = {
    id: ep.id,
    name: ep.name,
    enabledModelIds: [] as string[],
    disabledModelIds: [] as string[],
    discoveredModels: [],
  };
  switch (typeId) {
    case 'custom-anthropic':
    case 'custom-openai-chat':
    case 'custom-openai-responses':
    case 'custom-google':
      return {
        ...base,
        typeId,
        config: {
          baseUrl: ep.baseUrl,
          encryptedApiKey: ep.encryptedApiKey,
          modelIdMapping: ep.modelIdMapping,
        },
      };
    case 'azure':
      return {
        ...base,
        typeId,
        config: {
          baseUrl: ep.baseUrl,
          encryptedApiKey: ep.encryptedApiKey,
          resourceName: ep.resourceName,
          apiVersion: ep.apiVersion,
          modelIdMapping: ep.modelIdMapping,
        },
      };
    case 'bedrock':
      return {
        ...base,
        typeId,
        config: {
          encryptedApiKey: ep.encryptedApiKey,
          encryptedSecretKey: ep.encryptedSecretKey,
          region: ep.region,
          awsAuthMode: ep.awsAuthMode,
          awsProfileName: ep.awsProfileName,
          modelIdMapping: ep.modelIdMapping,
        },
      };
    case 'vertex':
      return {
        ...base,
        typeId,
        config: {
          encryptedGoogleCredentials: ep.encryptedGoogleCredentials,
          projectId: ep.projectId,
          location: ep.location,
          modelIdMapping: ep.modelIdMapping,
        },
      };
    default:
      throw new Error(`Unsupported apiSpec: ${ep.apiSpec}`);
  }
}

function createTestModelProviderService({
  providerModes = {},
  connectedCodingPlanIds = {},
  modelThinkingOverrides = {},
  customEndpoints = [],
}: {
  providerModes?: Record<string, 'stagewise' | 'official' | 'custom'>;
  connectedCodingPlanIds?: Record<string, string | undefined>;
  modelThinkingOverrides?: Record<
    string,
    {
      enabled?: boolean;
      value?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    }
  >; // Flat format — wrapped under 'stagewise-default' below.
  customEndpoints?: typeof defaultUserPreferences.customEndpoints;
} = {}) {
  const preferences = structuredClone(defaultUserPreferences);
  // Wrap flat overrides under the stagewise-default instance key.
  preferences.agent.modelThinkingOverrides =
    Object.keys(modelThinkingOverrides).length > 0
      ? { 'stagewise-default': modelThinkingOverrides as any }
      : {};

  const instances: ProviderInstance[] = [];

  for (const [provider, mode] of Object.entries(providerModes)) {
    if (mode === 'stagewise') continue;

    const config =
      preferences.providerConfigs[
        provider as keyof typeof preferences.providerConfigs
      ];
    config.mode = mode;

    if (mode === 'official') {
      const planId = connectedCodingPlanIds[provider];
      if (planId) {
        const plan = CODING_PLANS[planId as keyof typeof CODING_PLANS];
        instances.push({
          id: `coding-plan-${provider}`,
          typeId: 'coding-plan',
          name: plan?.displayName ?? 'Coding Plan',
          config: {
            encryptedApiKey: 'encrypted',
            planId,
            baseUrl: plan?.baseUrl,
          },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        });
      } else {
        instances.push({
          id: `${provider}-api-default`,
          typeId: `${provider}-api`,
          name: provider,
          config: { encryptedApiKey: 'encrypted' },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        } as unknown as ProviderInstance);
      }
    } else if (mode === 'custom') {
      // For custom mode, set the legacy providerConfigs link so the
      // hybrid routing's findInstanceForVendor can resolve the vendor
      // to this custom instance.
      const customId = `${provider}-custom`;
      config.customProviderId = customId;
      // Find or create a matching custom endpoint instance.
      const existingEp = customEndpoints.find((ep) => ep.id === customId);
      if (existingEp) {
        instances.push(customEndpointToInstance(existingEp));
      } else {
        // If no matching endpoint is provided, create a minimal
        // openai-chat-compatible instance.
        instances.push({
          id: customId,
          typeId: 'custom-openai-chat',
          name: `${provider} custom`,
          config: { baseUrl: 'https://example.com/v1' },
          enabledModelIds: [],
          disabledModelIds: [],
          discoveredModels: [],
        });
      }
    }
  }

  // Add any remaining custom endpoints (not consumed by custom-mode
  // vendors) as standalone instances.
  const consumedIds = new Set(
    Object.entries(providerModes)
      .filter(([, m]) => m === 'custom')
      .map(([p]) => `${p}-custom`),
  );
  for (const ep of customEndpoints) {
    if (!consumedIds.has(ep.id)) {
      instances.push(customEndpointToInstance(ep));
    }
  }

  preferences.providerInstances = instances;

  return new ModelProviderService(
    {
      withTracing: vi.fn((model) => model),
      captureException: vi.fn(),
    } as any,
    { accessToken: 'stagewise-token' } as any,
    {
      get: vi.fn(() => preferences),
      decryptProviderApiKey: vi.fn(() => 'provider-api-key'),
    } as any,
  );
}

const agentStepMetadata = {
  [MODEL_REQUEST_PURPOSE_METADATA_KEY]: 'agent-step',
};

function getModelRequestUrl(
  result: ReturnType<ModelProviderService['getModelWithOptions']>,
) {
  const model = result.model as unknown as {
    config?: { url?: (options: { path: string }) => URL };
  };
  return model.config?.url?.({ path: '/chat/completions' }).toString();
}

describe('custom model provider instance routing', () => {
  it('uses the referenced vendor API instance credentials and endpoint', () => {
    const service = createTestModelProviderService({
      providerModes: { openai: 'official' },
    });
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openai-api-first',
        typeId: 'openai-api',
        name: 'OpenAI first',
        config: {
          encryptedApiKey: 'first-key',
          baseUrl: 'https://first.example.com/v1',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
      {
        id: 'openai-api-selected',
        typeId: 'openai-api',
        name: 'OpenAI selected',
        config: {
          encryptedApiKey: 'selected-key',
          baseUrl: 'https://selected.example.com/v1',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];
    preferences.customModels.push({
      modelId: 'selected-openai-custom',
      displayName: 'Selected OpenAI custom model',
      providerInstanceId: 'openai-api-selected',
      providerOptions: {},
      headers: {},
      contextWindowSize: 128_000,
    });
    const decryptProviderApiKey = (service as any).preferencesService
      .decryptProviderApiKey;
    decryptProviderApiKey.mockImplementation(
      (encrypted: string) => `decrypted:${encrypted}`,
    );

    const result = service.getModelWithOptions(
      'selected-openai-custom',
      'trace-1',
    );

    expect(decryptProviderApiKey).toHaveBeenCalledWith('selected-key');
    expect(decryptProviderApiKey).not.toHaveBeenCalledWith('first-key');
    expect(getModelRequestUrl(result)).toBe(
      'https://selected.example.com/v1/chat/completions',
    );
  });

  it('uses a coding plan base URL when the selected instance has none', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'coding-plan-first',
        typeId: 'coding-plan',
        name: 'Other GLM Coding Plan',
        config: {
          encryptedApiKey: 'first-plan-key',
          planId: 'glm-coding-plan',
          baseUrl: 'https://wrong.example.com/v4',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
      {
        id: 'coding-plan-selected',
        typeId: 'coding-plan',
        name: 'Selected GLM Coding Plan',
        config: {
          encryptedApiKey: 'selected-plan-key',
          planId: 'glm-coding-plan',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];
    preferences.customModels.push({
      modelId: 'selected-plan-custom',
      displayName: 'Selected coding plan custom model',
      providerInstanceId: 'coding-plan-selected',
      providerOptions: {},
      headers: {},
      contextWindowSize: 128_000,
    });
    const decryptProviderApiKey = (service as any).preferencesService
      .decryptProviderApiKey;
    decryptProviderApiKey.mockImplementation(
      (encrypted: string) => `decrypted:${encrypted}`,
    );

    const result = service.getModelWithOptions(
      'selected-plan-custom',
      'trace-1',
    );

    expect(decryptProviderApiKey).toHaveBeenCalledWith('selected-plan-key');
    expect(decryptProviderApiKey).not.toHaveBeenCalledWith('first-plan-key');
    expect(getModelRequestUrl(result)).toBe(
      'https://api.z.ai/api/coding/paas/v4/chat/completions',
    );
  });
});

describe('deleted provider instance recovery', () => {
  it('routes built-in models through Stagewise when their instance was deleted', () => {
    const service = createTestModelProviderService();

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      undefined,
      'deleted-openai-instance',
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'stagewise',
      provider: 'openai',
    });
  });

  it('keeps custom models unavailable after their provider instance is deleted', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.customModels.push({
      modelId: 'deleted-custom-model',
      displayName: 'Deleted Custom Model',
      providerInstanceId: 'deleted-instance',
    });

    expect(() =>
      service.getModelWithOptions(
        'deleted-custom-model',
        'trace-1',
        undefined,
        'deleted-instance',
      ),
    ).toThrow('Provider instance deleted-instance not found');
  });
});

describe('model alias routing', () => {
  it('accepts alias IDs as built-in models', () => {
    const service = createTestModelProviderService();

    expect(service.modelExists('default')).toBe(true);
    expect(service.modelExists('quick')).toBe(true);
    expect(service.modelExists('smart')).toBe(true);
  });

  it.each([
    ['default', 'deepseek', 'deepseek-v4-pro'],
    ['quick', 'google', 'gemini-3.5-flash'],
    ['smart', 'z-ai', 'glm-5.2'],
  ] as const)('routes %s through the target built-in model', (aliasId, provider, targetModelId) => {
    const service = createTestModelProviderService();

    const result = service.getModelWithOptions(aliasId, 'trace-1');

    expect(result.contextWindowSize).toBeGreaterThan(0);
    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'stagewise',
      provider,
      modelId: `${provider}/${targetModelId}`,
    });
  });

  it('uses fixed preset reasoning for alias requests', () => {
    const service = createTestModelProviderService();

    const defaultResult = service.getModelWithOptions(
      'default',
      'trace-1',
      agentStepMetadata,
    );
    const quickResult = service.getModelWithOptions(
      'quick',
      'trace-1',
      agentStepMetadata,
    );
    const smartResult = service.getModelWithOptions(
      'smart',
      'trace-1',
      agentStepMetadata,
    );

    expect(defaultResult.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'medium' },
      stagewise: {
        reasoning: { enabled: true, effort: 'medium' },
        provider: { require_parameters: true },
      },
    });
    expect(quickResult.providerOptions).toMatchObject({
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' },
      },
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    });
    expect(smartResult.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'xhigh' },
      stagewise: { reasoning: { enabled: true, effort: 'xhigh' } },
    });
  });

  it('ignores target model thinking overrides for alias requests', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: {
        'deepseek-v4-pro': { value: 'high' },
      },
    });

    const result = service.getModelWithOptions(
      'default',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'medium' },
      stagewise: {
        reasoning: { enabled: true, effort: 'medium' },
        provider: { require_parameters: true },
      },
    });
  });

  it('keeps target model thinking overrides for concrete requests', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: {
        'deepseek-v4-pro': { value: 'high' },
      },
    });

    const result = service.getModelWithOptions(
      'deepseek-v4-pro',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'high' },
      stagewise: {
        reasoning: { enabled: true, effort: 'medium' },
        provider: { require_parameters: true },
      },
    });
  });
});

describe('official provider endpoint resolution', () => {
  it('routes connected GLM Coding Plan requests through the coding endpoint', () => {
    const service = createTestModelProviderService({
      providerModes: { 'z-ai': 'official' },
      connectedCodingPlanIds: { 'z-ai': 'glm-coding-plan' },
    });

    const result = service.getModelWithOptions('glm-5.2', 'trace-1');

    expect(result.providerMode).toBe('official');
    expect(getModelRequestUrl(result)).toBe(
      'https://api.z.ai/api/coding/paas/v4/chat/completions',
    );
  });

  it('keeps normal official Z.ai requests on the general endpoint', () => {
    const service = createTestModelProviderService({
      providerModes: { 'z-ai': 'official' },
    });

    const result = service.getModelWithOptions('glm-5.2', 'trace-1');

    expect(result.providerMode).toBe('official');
    expect(getModelRequestUrl(result)).toBe(
      'https://api.z.ai/api/paas/v4/chat/completions',
    );
  });
});

describe('thinking override provider option resolution', () => {
  it('returns base provider options unchanged when no override exists', () => {
    const service = createTestModelProviderService();

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
    });
  });

  it('uses stagewise-compatible xhigh for GLM 5.2 max reasoning', () => {
    const service = createTestModelProviderService();

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'xhigh' } },
      openai: { reasoningEffort: 'xhigh' },
    });
  });

  it('keeps stagewise-compatible xhigh when overriding GLM 5.2 effort', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'glm-5.2': { value: 'low' } },
    });

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'xhigh' } },
      openai: { reasoningEffort: 'low' },
    });
  });

  it('does not apply overrides without agent-step request purpose', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'gpt-5.5': { value: 'high' } },
    });

    const result = service.getModelWithOptions('gpt-5.5', 'trace-1');

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    });
  });

  it('applies built-in overrides for agent-step requests', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'gpt-5.5': { value: 'high' } },
    });

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: { reasoningEffort: 'high' },
    });
  });

  it('produces provider-specific disabled thinking options', () => {
    const service = createTestModelProviderService({
      providerModes: { anthropic: 'official' },
      modelThinkingOverrides: { 'claude-fable-5': { enabled: false } },
    });

    const result = service.getModelWithOptions(
      'claude-fable-5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'disabled' } },
    });
    expect(result.providerOptions?.anthropic).not.toHaveProperty('effort');
  });

  it('disables OpenAI thinking with the provider-native off value', () => {
    const service = createTestModelProviderService({
      providerModes: { openai: 'official' },
      modelThinkingOverrides: { 'gpt-5.5': { enabled: false } },
    });

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: {
        reasoningEffort: 'none',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    });
  });

  it('disables Google thinking without leaving a thinking level', () => {
    const service = createTestModelProviderService({
      providerModes: { google: 'official' },
      modelThinkingOverrides: {
        'gemini-3.1-pro-preview': { enabled: false },
      },
    });

    const result = service.getModelWithOptions(
      'gemini-3.1-pro-preview',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      google: { thinkingConfig: { includeThoughts: false } },
    });
    expect(result.providerOptions?.google).toMatchObject({
      thinkingConfig: expect.not.objectContaining({
        thinkingLevel: expect.anything(),
      }),
    });
  });

  it('disables stagewise-routed OpenAI thinking with provider-native options', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'gpt-5.5': { enabled: false } },
    });

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      openai: { reasoningEffort: 'none' },
    });
  });

  it('treats empty override objects as no-ops', () => {
    const service = createTestModelProviderService({
      providerModes: { google: 'official' },
      modelThinkingOverrides: { 'gemini-3.1-pro-preview': {} },
    });

    const result = service.getModelWithOptions(
      'gemini-3.1-pro-preview',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
      },
    });
  });

  it('preserves unrelated stagewise provider options', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'deepseek-v4-pro': { value: 'high' } },
    });

    const result = service.getModelWithOptions(
      'deepseek-v4-pro',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'high' },
      stagewise: {
        reasoning: { enabled: true, effort: 'medium' },
        provider: { require_parameters: true },
      },
    });
  });

  it('maps OpenAI-compatible official overrides to the OpenAI provider namespace', () => {
    const service = createTestModelProviderService({
      providerModes: { deepseek: 'official' },
      modelThinkingOverrides: { 'deepseek-v4-pro': { value: 'high' } },
    });

    const result = service.getModelWithOptions(
      'deepseek-v4-pro',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions?.openai).toMatchObject({
      reasoningEffort: 'high',
    });
    expect(result.providerOptions).not.toHaveProperty('deepseek');
  });

  it('maps OpenAI official overrides while preserving unrelated options', () => {
    const service = createTestModelProviderService({
      providerModes: { openai: 'official' },
      modelThinkingOverrides: { 'gpt-5.5': { value: 'high' } },
    });

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
        parallelToolCalls: true,
        strictJsonSchema: true,
      },
    });
  });

  it('maps Google official overrides while preserving thinking config', () => {
    const service = createTestModelProviderService({
      providerModes: { google: 'official' },
      modelThinkingOverrides: {
        'gemini-3.1-pro-preview': { value: 'low' },
      },
    });

    const result = service.getModelWithOptions(
      'gemini-3.1-pro-preview',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'low' },
      },
    });
  });

  it('uses active provider defaults when enabling without effort', () => {
    const service = createTestModelProviderService({
      providerModes: { google: 'official' },
      modelThinkingOverrides: {
        'gemini-3.1-pro-preview': { enabled: true },
      },
    });

    const result = service.getModelWithOptions(
      'gemini-3.1-pro-preview',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
      },
    });
  });

  it('maps Anthropic official overrides while preserving adaptive shape', () => {
    const service = createTestModelProviderService({
      providerModes: { anthropic: 'official' },
      modelThinkingOverrides: { 'claude-fable-5': { value: 'high' } },
    });

    const result = service.getModelWithOptions(
      'claude-fable-5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'adaptive' }, effort: 'high' },
    });
  });

  it('maps Stagewise-routed Anthropic overrides to Anthropic options', () => {
    const service = createTestModelProviderService({
      modelThinkingOverrides: { 'claude-opus-4.8': { value: 'max' } },
    });

    const result = service.getModelWithOptions(
      'claude-opus-4.8',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      stagewise: { reasoning: { enabled: true, effort: 'medium' } },
      anthropic: { thinking: { type: 'adaptive' }, effort: 'max' },
    });
  });

  it('uses OpenAI-compatible options for custom chat completions endpoints', () => {
    const service = createTestModelProviderService({
      providerModes: { openai: 'custom' },
      modelThinkingOverrides: { 'gpt-5.5': { value: 'xhigh' } },
      customEndpoints: [
        {
          id: 'openai-custom',
          name: 'OpenAI-compatible',
          apiSpec: 'openai-chat-completions',
          baseUrl: 'https://example.com/v1',
          awsAuthMode: 'access-keys',
        },
      ],
    });

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'medium' },
    });
  });
});

describe('reasoning signature source helpers', () => {
  it('maps custom endpoint API specs to semantic providers', () => {
    expect(getSemanticProviderForApiSpec('anthropic')).toBe('anthropic');
    expect(getSemanticProviderForApiSpec('amazon-bedrock')).toBe('anthropic');
    expect(getSemanticProviderForApiSpec('google')).toBe('google');
    expect(getSemanticProviderForApiSpec('google-vertex')).toBe('google');
    expect(getSemanticProviderForApiSpec('openai-chat-completions')).toBe(
      'openai',
    );
    expect(getSemanticProviderForApiSpec('openai-responses')).toBe('openai');
    expect(getSemanticProviderForApiSpec('azure')).toBe('openai');
  });

  it('creates stagewise and official sources with provider and model id', () => {
    expect(
      createReasoningSignatureSource(
        'stagewise',
        'anthropic',
        'anthropic/claude-sonnet-4.6',
      ),
    ).toEqual({
      providerMode: 'stagewise',
      provider: 'anthropic',
      modelId: 'anthropic/claude-sonnet-4.6',
    });

    expect(
      createReasoningSignatureSource('official', 'openai', 'gpt-5.4'),
    ).toEqual({
      providerMode: 'official',
      provider: 'openai',
      modelId: 'gpt-5.4',
    });
  });

  it('creates custom sources with API spec and endpoint id', () => {
    expect(
      createReasoningSignatureSource('custom', 'google', 'gemini-custom', {
        apiSpec: 'google-vertex',
        endpointId: 'vertex-prod',
      }),
    ).toEqual({
      providerMode: 'custom',
      provider: 'google',
      modelId: 'gemini-custom',
      apiSpec: 'google-vertex',
      endpointId: 'vertex-prod',
    });
  });

  it('rejects incomplete or inconsistent custom source construction', () => {
    expect(() =>
      createReasoningSignatureSource('custom', 'google', 'gemini-custom', {
        apiSpec: 'google-vertex',
      } as any),
    ).toThrow('apiSpec and endpointId');
    expect(() =>
      createReasoningSignatureSource('custom', 'google', 'gemini-custom', {
        endpointId: 'vertex-prod',
      } as any),
    ).toThrow('apiSpec and endpointId');
    expect(() =>
      createReasoningSignatureSource('custom', 'google', 'gemini-custom', {
        apiSpec: 'amazon-bedrock',
        endpointId: 'bedrock-prod',
      }),
    ).toThrow('provider/apiSpec mismatch');
  });

  it('matches non-custom sources by provider mode and provider only', () => {
    const a: ReasoningSignatureSource = {
      providerMode: 'stagewise',
      provider: 'anthropic',
      modelId: 'anthropic/claude-a',
    };
    const b: ReasoningSignatureSource = {
      providerMode: 'stagewise',
      provider: 'anthropic',
      modelId: 'anthropic/claude-b',
    };
    const c: ReasoningSignatureSource = {
      providerMode: 'official',
      provider: 'anthropic',
      modelId: 'claude-a',
    };

    expect(reasoningSourcesMatch(a, b)).toBe(true);
    expect(reasoningSourcesMatch(a, c)).toBe(false);
  });

  it('matches custom sources by provider, API spec, and endpoint id', () => {
    const base: ReasoningSignatureSource = {
      providerMode: 'custom',
      provider: 'anthropic',
      apiSpec: 'amazon-bedrock',
      endpointId: 'bedrock-prod',
      modelId: 'anthropic.claude-sonnet-4-6',
    };

    expect(
      reasoningSourcesMatch(base, {
        ...base,
        modelId: 'anthropic.claude-opus-4-7',
      }),
    ).toBe(true);
    expect(
      reasoningSourcesMatch(base, { ...base, endpointId: 'bedrock-dev' }),
    ).toBe(false);
    expect(reasoningSourcesMatch(base, { ...base, apiSpec: 'anthropic' })).toBe(
      false,
    );
    expect(reasoningSourcesMatch(base, { ...base, apiSpec: undefined })).toBe(
      false,
    );
    expect(
      reasoningSourcesMatch(base, { ...base, endpointId: undefined }),
    ).toBe(false);
  });

  it('validates reasoning signature source schema invariants', () => {
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'stagewise',
        provider: 'anthropic',
        modelId: 'anthropic/claude-sonnet-4.6',
      }).success,
    ).toBe(true);
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'official',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4.6',
      }).success,
    ).toBe(true);
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'stagewise',
        provider: 'anthropic',
      }).success,
    ).toBe(false);
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'custom',
        provider: 'google',
        modelId: 'gemini-custom',
        endpointId: 'vertex-prod',
      }).success,
    ).toBe(false);
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'custom',
        provider: 'google',
        modelId: 'gemini-custom',
        apiSpec: 'google-vertex',
      }).success,
    ).toBe(false);
    expect(
      reasoningSignatureSourceSchema.safeParse({
        providerMode: 'custom',
        provider: 'google',
        modelId: 'gemini-custom',
        apiSpec: 'google-vertex',
        endpointId: 'vertex-prod',
      }).success,
    ).toBe(true);
  });
});
