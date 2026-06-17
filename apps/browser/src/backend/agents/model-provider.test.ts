import { describe, expect, it, vi } from 'vitest';
import { defaultUserPreferences } from '@shared/karton-contracts/ui/shared-types';
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

function createTestModelProviderService({
  providerModes = {},
  modelThinkingOverrides = {},
  customEndpoints = [],
}: {
  providerModes?: Record<string, 'stagewise' | 'official' | 'custom'>;
  modelThinkingOverrides?: Record<
    string,
    {
      enabled?: boolean;
      value?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    }
  >;
  customEndpoints?: typeof defaultUserPreferences.customEndpoints;
} = {}) {
  const preferences = structuredClone(defaultUserPreferences);
  preferences.agent.modelThinkingOverrides = modelThinkingOverrides;
  preferences.customEndpoints = customEndpoints;
  for (const [provider, mode] of Object.entries(providerModes)) {
    const config =
      preferences.providerConfigs[
        provider as keyof typeof preferences.providerConfigs
      ];
    config.mode = mode;
    if (mode === 'custom') config.customProviderId = `${provider}-custom`;
  }

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
