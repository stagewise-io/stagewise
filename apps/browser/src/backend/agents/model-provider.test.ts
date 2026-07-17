import { describe, expect, it, vi } from 'vitest';
import {
  defaultUserPreferences,
  type ProviderInstance,
  type CustomEndpoint,
} from '@shared/karton-contracts/ui/shared-types';
import {
  MODEL_REQUEST_PURPOSE_METADATA_KEY,
  PROVIDER_INSTANCE_ID_METADATA_KEY,
} from '@stagewise/agent-core/host';
import { ModelProviderService } from './model-provider';
import { getProviderType } from './providers/registry';
import {
  reasoningSignatureSourceSchema,
  type ReasoningSignatureSource,
} from '@shared/karton-contracts/ui/agent/metadata';
import {
  createReasoningSignatureSource,
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

describe('provider instance base URL resolution', () => {
  const openRouterType = getProviderType('openrouter');

  it('trims an explicit OpenRouter base URL at runtime', () => {
    const url = (ModelProviderService as any).resolveInstanceBaseURL(
      {
        id: 'openrouter-explicit',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { baseUrl: '  https://router.example/v1/  ' },
      },
      openRouterType,
    );

    expect(url).toBe('https://router.example/v1/');
  });

  it('uses the OpenRouter default when the configured URL is whitespace', () => {
    const url = (ModelProviderService as any).resolveInstanceBaseURL(
      {
        id: 'openrouter-blank',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { baseUrl: '   ' },
      },
      openRouterType,
    );

    expect(url).toBe('https://openrouter.ai/api/v1');
  });

  it('uses the resolved OpenRouter URL for discovered models', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-blank',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { baseUrl: '   ' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: 'openai/gpt-5',
            displayName: 'GPT-5',
          },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      'openai/gpt-5',
      'trace-1',
      undefined,
      'openrouter-blank',
    );

    expect(getModelRequestUrl(result)).toBe(
      'https://openrouter.ai/api/v1/chat/completions',
    );
  });
});

describe('discovered model routing', () => {
  it('requires an owning instance for discovered models with duplicate IDs', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = ['one', 'two'].map((id) => ({
      id,
      typeId: 'ollama',
      name: id,
      config: { baseUrl: `http://${id}.example` },
      enabledModelIds: [],
      disabledModelIds: [],
      discoveredModels: [{ modelId: 'local-chat', displayName: 'Local chat' }],
    }));

    expect(service.modelExists('local-chat')).toBe(false);
    expect(service.modelExists('local-chat', 'one')).toBe(true);
    expect(service.modelExists('local-chat', 'two')).toBe(true);
    expect(service.modelExists('local-chat', 'missing')).toBe(false);
    expect(service.modelExists('gpt-5.5', 'one')).toBe(false);
    expect(() => service.getModelWithOptions('local-chat', 'trace-1')).toThrow(
      'Model local-chat not found',
    );
    expect(
      getModelRequestUrl(
        service.getModelWithOptions('local-chat', 'trace-1', undefined, 'two'),
      ),
    ).toBe('http://two.example/v1/chat/completions');
  });

  it.each([
    'default',
    'deepseek-v4-pro',
  ])('routes a self-hosted discovered model named %s through its owning instance', (modelId) => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'ollama-local',
        typeId: 'ollama',
        name: 'Local Ollama',
        config: { baseUrl: 'http://ollama.example' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [{ modelId, displayName: modelId }],
      },
    ];

    const result = service.getModelWithOptions(
      modelId,
      'trace-1',
      undefined,
      'ollama-local',
    );

    expect(getModelRequestUrl(result)).toBe(
      'http://ollama.example/v1/chat/completions',
    );
    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'custom',
      modelId,
      endpointId: 'ollama-local',
    });
  });

  it('prefers an instance-owned custom model over a discovered duplicate', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'custom-instance',
        typeId: 'custom-openai-chat',
        name: 'Custom OpenAI',
        config: { baseUrl: 'https://discovered.example/v1' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          { modelId: 'duplicate-model', displayName: 'Discovered duplicate' },
        ],
      },
    ];
    preferences.customModels = [
      {
        modelId: 'duplicate-model',
        displayName: 'Configured custom model',
        providerInstanceId: 'custom-instance',
        endpointId: 'custom-instance',
        providerOptions: {},
        headers: {},
        contextWindowSize: 64_000,
      },
      {
        modelId: 'other-custom-model',
        displayName: 'Other custom model',
        providerInstanceId: 'other-instance',
        endpointId: 'other-instance',
        providerOptions: {},
        headers: {},
        contextWindowSize: 64_000,
      },
    ];

    expect(service.modelExists('duplicate-model', 'custom-instance')).toBe(
      true,
    );
    expect(service.modelExists('other-custom-model', 'custom-instance')).toBe(
      false,
    );
    const result = service.getModelWithOptions(
      'duplicate-model',
      'trace-1',
      undefined,
      'custom-instance',
    );

    expect(getModelRequestUrl(result)).toBe(
      'https://discovered.example/v1/chat/completions',
    );
    expect(result.providerMode).toBe('custom');
    expect(
      (service as any).telemetryService.withTracing.mock.calls[0]?.[1]
        .posthogProperties,
    ).toMatchObject({ isCustomModel: true });
  });

  it('does not resolve a custom model through a different explicit instance', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'requested-instance',
        typeId: 'custom-openai-chat',
        name: 'Requested instance',
        config: { baseUrl: 'https://requested.example/v1' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
      {
        id: 'owning-instance',
        typeId: 'custom-openai-chat',
        name: 'Owning instance',
        config: { baseUrl: 'https://owning.example/v1' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];
    preferences.customModels = [
      {
        modelId: 'instance-scoped-model',
        displayName: 'Instance-scoped model',
        providerInstanceId: 'owning-instance',
        endpointId: 'owning-instance',
        providerOptions: {},
        headers: {},
        contextWindowSize: 64_000,
      },
    ];

    expect(
      service.modelExists('instance-scoped-model', 'requested-instance'),
    ).toBe(false);
    expect(() =>
      service.getModelWithOptions(
        'instance-scoped-model',
        'trace-1',
        undefined,
        'requested-instance',
      ),
    ).toThrow('Model instance-scoped-model not found');
  });

  it('rejects catalog models that are not selectable on an explicit instance', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'anthropic-instance',
        typeId: 'anthropic-api',
        name: 'Anthropic API',
        config: { encryptedApiKey: 'encrypted' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    expect(service.modelExists('gpt-5.5', 'anthropic-instance')).toBe(false);
    expect(() =>
      service.getModelWithOptions(
        'gpt-5.5',
        'trace-1',
        undefined,
        'anthropic-instance',
      ),
    ).toThrow('Model gpt-5.5 not found');
  });

  it('rejects disabled discovered models on an explicit instance', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'ollama-local',
        typeId: 'ollama',
        name: 'Local Ollama',
        config: { baseUrl: 'http://ollama.example' },
        enabledModelIds: ['enabled-model'],
        disabledModelIds: [],
        discoveredModels: [
          { modelId: 'enabled-model', displayName: 'Enabled' },
          { modelId: 'ineligible-model', displayName: 'Ineligible' },
        ],
      },
    ];

    expect(service.modelExists('ineligible-model', 'ollama-local')).toBe(false);
    expect(() =>
      service.getModelWithOptions(
        'ineligible-model',
        'trace-1',
        undefined,
        'ollama-local',
      ),
    ).toThrow('Model ineligible-model not found');
  });

  it('keeps catalog precedence for discovered duplicates on vendor instances', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'deepseek-api-local',
        typeId: 'deepseek-api',
        name: 'DeepSeek API',
        config: { encryptedApiKey: 'encrypted' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          { modelId: 'deepseek-v4-pro', displayName: 'Discovered duplicate' },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      'deepseek-v4-pro',
      'trace-1',
      undefined,
      'deepseek-api-local',
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'deepseek',
      modelId: 'deepseek-v4-pro',
    });
    expect(
      (service as any).telemetryService.withTracing.mock.calls[0]?.[1]
        .posthogProperties,
    ).not.toHaveProperty('isDiscoveredModel');
  });

  it('adds a default thinking patch for sparse discovered models', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-instance',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { encryptedApiKey: 'router-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: 'openai/gpt-5',
            displayName: 'GPT-5',
            thinkingEnabled: true,
          },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      'openai/gpt-5',
      'trace-1',
      agentStepMetadata,
      'openrouter-instance',
    );

    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'medium' },
    });
  });

  it('uses OpenRouter-compatible thinking, vendor-owned official signatures, and safe telemetry', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-instance',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { encryptedApiKey: 'router-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: 'openai/gpt-5',
            displayName: 'GPT-5',
            thinkingEnabled: true,
          },
        ],
      },
    ];
    preferences.agent.modelThinkingOverrides = {
      'openrouter-instance': {
        'openai/gpt-5': {
          enabled: true,
          provider: 'openai-compatible',
          value: 'high',
        },
      },
    };

    const result = service.getModelWithOptions(
      'openai/gpt-5',
      'trace-1',
      {
        [MODEL_REQUEST_PURPOSE_METADATA_KEY]: 'agent-step',
        [PROVIDER_INSTANCE_ID_METADATA_KEY]: 'openrouter-instance',
        requestSource: 'discovered-routing-test',
      },
      'openrouter-instance',
    );

    expect(result.providerMode).toBe('official');
    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'openai',
    });
    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'high' },
    });

    const tracingConfig = (service as any).telemetryService.withTracing.mock
      .calls[0]?.[1];
    expect(tracingConfig.posthogProperties).toMatchObject({
      requestSource: 'discovered-routing-test',
      isDiscoveredModel: true,
    });
    expect(tracingConfig.posthogProperties).not.toHaveProperty(
      MODEL_REQUEST_PURPOSE_METADATA_KEY,
    );
    expect(tracingConfig.posthogProperties).not.toHaveProperty(
      PROVIDER_INSTANCE_ID_METADATA_KEY,
    );
  });

  it('keeps OpenRouter reasoning signatures scoped to the routed vendor', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-instance',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { encryptedApiKey: 'router-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: 'anthropic/claude-opus-4.8',
            displayName: 'Claude Opus 4.8',
            thinkingEnabled: true,
          },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      'anthropic/claude-opus-4.8',
      'trace-1',
      agentStepMetadata,
      'openrouter-instance',
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'anthropic',
    });
    expect(
      reasoningSourcesMatch(result.reasoningSignatureSource!, {
        providerMode: 'official',
        provider: 'openai',
        modelId: 'openai/gpt-5',
      }),
    ).toBe(false);
  });

  it.each([
    ['qwen/qwen3-coder-plus', 'alibaba'],
    ['xiaomi/mimo-v2.5', 'xiaomi-mimo'],
    ['mistralai/mistral-medium-3-5', 'mistral'],
  ] as const)('maps OpenRouter alias prefix %s to semantic provider %s', (modelId, provider) => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-instance',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { encryptedApiKey: 'router-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId,
            displayName: modelId,
            thinkingEnabled: true,
          },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      modelId,
      'trace-1',
      agentStepMetadata,
      'openrouter-instance',
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider,
    });
  });

  it('keeps tilde-prefixed OpenRouter signatures scoped to the routed vendor', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'openrouter-instance',
        typeId: 'openrouter',
        name: 'OpenRouter',
        config: { encryptedApiKey: 'router-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: '~anthropic/claude-haiku-latest',
            displayName: 'Claude Haiku',
            thinkingEnabled: true,
          },
        ],
      },
    ];

    const result = service.getModelWithOptions(
      '~anthropic/claude-haiku-latest',
      'trace-1',
      agentStepMetadata,
      'openrouter-instance',
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'anthropic',
    });
  });

  it('keeps discovered custom routes endpoint-bound', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'custom-instance',
        typeId: 'custom-openai-chat',
        name: 'Custom OpenAI',
        config: { baseUrl: 'https://custom.example/v1' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [
          {
            modelId: 'gpt-5.5',
            displayName: 'Custom GPT-5.5',
            thinkingEnabled: true,
          },
        ],
      },
    ];
    preferences.agent.modelThinkingOverrides = {
      'custom-instance': {
        'gpt-5.5': {
          enabled: true,
          provider: 'openai-compatible',
          value: 'high',
        },
      },
    };

    const result = service.getModelWithOptions(
      'gpt-5.5',
      'trace-1',
      agentStepMetadata,
      'custom-instance',
    );

    expect(result.providerMode).toBe('custom');
    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'custom',
      provider: 'openai',
      apiSpec: 'openai-chat-completions',
      endpointId: 'custom-instance',
    });
    expect(result.providerOptions).toMatchObject({
      openai: { reasoningEffort: 'high' },
    });
  });
});

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

  it('removes reserved routing metadata from telemetry properties', () => {
    const service = createTestModelProviderService();
    const metadata = {
      [PROVIDER_INSTANCE_ID_METADATA_KEY]: 'openai-api-selected',
      [MODEL_REQUEST_PURPOSE_METADATA_KEY]: 'agent-step',
      requestSource: 'test',
    };

    service.getModelWithOptions('gpt-5.5', 'trace-1', metadata);

    const withTracing = (service as any).telemetryService.withTracing;
    expect(withTracing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        posthogProperties: expect.objectContaining({
          requestSource: 'test',
          modelId: 'gpt-5.5',
        }),
      }),
    );
    const config = withTracing.mock.calls[0]?.[1];
    expect(config.posthogProperties).not.toHaveProperty(
      PROVIDER_INSTANCE_ID_METADATA_KEY,
    );
    expect(config.posthogProperties).not.toHaveProperty(
      MODEL_REQUEST_PURPOSE_METADATA_KEY,
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

describe('legacy Stagewise custom model routing', () => {
  it('keeps a migrated custom model on Stagewise when vendor BYOK exists', () => {
    const service = createTestModelProviderService({
      providerModes: { openai: 'official' },
    });
    const preferences = (service as any).preferencesService.get();
    preferences.customModels.push({
      modelId: 'legacy-stagewise-custom',
      displayName: 'Legacy Stagewise custom model',
      providerInstanceId: 'stagewise-default',
      endpointId: 'openai',
      providerOptions: {},
      headers: {},
      contextWindowSize: 128_000,
    });

    const result = service.getModelWithOptions(
      'legacy-stagewise-custom',
      'trace-1',
    );

    expect((result.model as any).modelId).toBe(
      'openai/legacy-stagewise-custom',
    );
    expect(
      (service as any).preferencesService.decryptProviderApiKey,
    ).not.toHaveBeenCalled();
    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'custom',
      provider: 'openai',
    });
  });
});

describe('deleted provider instance recovery', () => {
  it('preserves the legacy Stagewise sentinel without a persisted instance', () => {
    const service = createTestModelProviderService();

    expect(service.modelExists('gpt-5.5', 'stagewise-default')).toBe(true);
    expect(() =>
      service.getModelWithOptions(
        'gpt-5.5',
        'trace-1',
        undefined,
        'stagewise-default',
      ),
    ).not.toThrow();
  });

  it.each([
    'gpt-5.5',
    'default',
    'deepseek-v4-pro',
  ])('rejects catalog model %s when its explicit instance was deleted', (modelId) => {
    const service = createTestModelProviderService();

    expect(service.modelExists(modelId, 'deleted-instance')).toBe(false);
    expect(() =>
      service.getModelWithOptions(
        modelId,
        'trace-1',
        undefined,
        'deleted-instance',
      ),
    ).toThrow('Provider instance deleted-instance not found');
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
  it('prefers a concrete API instance over a stale stagewise legacy mode', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerConfigs.openai = {
      ...preferences.providerConfigs.openai,
      mode: 'stagewise',
    };
    preferences.providerInstances = [
      {
        id: 'openai-byok',
        typeId: 'openai-api',
        name: 'OpenAI BYOK',
        config: {
          encryptedApiKey: 'byok-key',
          baseUrl: 'https://byok.example.com/v1',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    const result = service.getModelWithOptions('gpt-5.5', 'trace-1');

    expect(result.providerMode).toBe('official');
    expect(getModelRequestUrl(result)).toBe(
      'https://byok.example.com/v1/chat/completions',
    );
  });

  it('prefers a coding plan over stale stagewise mode and earlier API instances', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerConfigs['z-ai'].mode = 'stagewise';
    preferences.providerInstances = [
      {
        id: 'z-ai-byok',
        typeId: 'z-ai-api',
        name: 'Z.ai BYOK',
        config: {
          encryptedApiKey: 'byok-key',
          baseUrl: 'https://byok.example.com/v4',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
      {
        id: 'z-ai-plan',
        typeId: 'coding-plan',
        name: 'GLM Coding Plan',
        config: { encryptedApiKey: 'plan-key', planId: 'glm-coding-plan' },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    const result = service.getModelWithOptions('glm-5.2', 'trace-1');

    expect(result.providerMode).toBe('official');
    expect(result.connectedCodingPlanId).toBe('glm-coding-plan');
    expect(getModelRequestUrl(result)).toBe(
      'https://api.z.ai/api/coding/paas/v4/chat/completions',
    );
  });

  it('routes vendor-resolved coding plans through the plan endpoint', () => {
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

  it('routes selected coding-plan instances through the plan endpoint', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
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

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      undefined,
      'coding-plan-selected',
    );

    expect(result.providerMode).toBe('official');
    expect(getModelRequestUrl(result)).toBe(
      'https://api.z.ai/api/coding/paas/v4/chat/completions',
    );
  });

  it('prefers an explicit coding-plan instance URL over the plan endpoint', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'coding-plan-selected',
        typeId: 'coding-plan',
        name: 'Selected GLM Coding Plan',
        config: {
          encryptedApiKey: 'selected-plan-key',
          planId: 'glm-coding-plan',
          baseUrl: 'https://override.example.com/v4',
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      undefined,
      'coding-plan-selected',
    );

    expect(getModelRequestUrl(result)).toBe(
      'https://override.example.com/v4/chat/completions',
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

describe('built-in model wire-format conversion', () => {
  it('converts canonical MiniMax IDs through custom OpenAI transports', () => {
    const service = createTestModelProviderService({
      providerModes: { minimax: 'custom' },
      customEndpoints: [
        {
          id: 'minimax-custom',
          name: 'MiniMax-compatible',
          apiSpec: 'openai-chat-completions',
          baseUrl: 'https://minimax.example.com/v1',
          awsAuthMode: 'access-keys',
        },
      ],
    });

    const result = service.getModelWithOptions('minimax-m3', 'trace-1');

    expect((result.model as unknown as { modelId: string }).modelId).toBe(
      'MiniMax-M3',
    );
  });

  it('uses a dotted custom Anthropic mapping as the final wire ID', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'custom-anthropic',
        typeId: 'custom-anthropic',
        name: 'Custom Anthropic',
        config: {
          baseUrl: 'https://anthropic.example.com/v1',
          modelIdMapping: {
            'claude-fable-5': 'provider.claude.fable',
          },
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    const result = service.getModelWithOptions(
      'claude-fable-5',
      'trace-1',
      undefined,
      'custom-anthropic',
    );

    expect((result.model as unknown as { modelId: string }).modelId).toBe(
      'provider.claude.fable',
    );
  });

  it('uses a dotted Bedrock mapping as the final wire ID', () => {
    const service = createTestModelProviderService();
    const preferences = (service as any).preferencesService.get();
    preferences.providerInstances = [
      {
        id: 'bedrock-anthropic',
        typeId: 'bedrock',
        name: 'Bedrock Anthropic',
        config: {
          awsAuthMode: 'default-chain',
          region: 'us-east-1',
          modelIdMapping: {
            'claude-fable-5': 'anthropic.claude-sonnet-4-20250514-v1:0',
          },
        },
        enabledModelIds: [],
        disabledModelIds: [],
        discoveredModels: [],
      },
    ];

    const result = service.getModelWithOptions(
      'claude-fable-5',
      'trace-1',
      undefined,
      'bedrock-anthropic',
    );

    expect((result.model as unknown as { modelId: string }).modelId).toBe(
      'anthropic.claude-sonnet-4-20250514-v1:0',
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

  it('preserves curated OpenAI-compatible defaults for official GLM 5.2 routes', () => {
    const service = createTestModelProviderService({
      providerModes: { 'z-ai': 'official' },
    });

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toEqual({
      stagewise: {
        reasoning: { enabled: true, effort: 'xhigh' },
        provider: { require_parameters: true },
      },
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

  it('uses compatible thinking and vendor signatures for official OpenAI-compatible APIs', () => {
    const service = createTestModelProviderService({
      providerModes: { deepseek: 'official' },
      modelThinkingOverrides: { 'deepseek-v4-pro': { enabled: false } },
    });

    const result = service.getModelWithOptions(
      'deepseek-v4-pro',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'deepseek',
    });
    expect(result.providerOptions?.openai).toMatchObject({
      reasoningEffort: undefined,
      reasoningSummary: undefined,
    });
  });

  it('uses compatible thinking and vendor signatures for coding plans', () => {
    const service = createTestModelProviderService({
      providerModes: { 'z-ai': 'official' },
      connectedCodingPlanIds: { 'z-ai': 'glm-coding-plan' },
      modelThinkingOverrides: { 'glm-5.2': { enabled: false } },
    });

    const result = service.getModelWithOptions(
      'glm-5.2',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.reasoningSignatureSource).toMatchObject({
      providerMode: 'official',
      provider: 'z-ai',
    });
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

  it('adds compatible defaults while preserving Claude catalog options', () => {
    const service = createTestModelProviderService({
      providerModes: { anthropic: 'custom' },
      customEndpoints: [
        {
          id: 'anthropic-custom',
          name: 'OpenAI-compatible Claude',
          apiSpec: 'openai-chat-completions',
          baseUrl: 'https://example.com/v1',
          awsAuthMode: 'access-keys',
        },
      ],
    });

    const result = service.getModelWithOptions(
      'claude-fable-5',
      'trace-1',
      agentStepMetadata,
    );

    expect(result.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'adaptive' } },
      openai: { reasoningEffort: 'medium' },
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

  it('rejects incomplete or semantically inconsistent custom sources', () => {
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

    for (const apiSpec of [
      'anthropic',
      'amazon-bedrock',
      'openai-chat-completions',
      'openai-responses',
      'azure',
    ] as const) {
      expect(() =>
        createReasoningSignatureSource('custom', 'google', 'custom-model', {
          apiSpec,
          endpointId: 'custom-endpoint',
        }),
      ).toThrow('provider/apiSpec mismatch');
    }
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
