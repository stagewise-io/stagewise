import { describe, expect, it } from 'vitest';
import {
  reasoningSignatureSourceSchema,
  type ReasoningSignatureSource,
} from '@shared/karton-contracts/ui/agent/metadata';
import {
  createReasoningSignatureSource,
  getSemanticProviderForApiSpec,
  reasoningSourcesMatch,
} from './reasoning-signatures';

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
