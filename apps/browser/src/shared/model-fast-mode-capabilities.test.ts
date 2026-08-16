import { describe, expect, it } from 'vitest';
import {
  createFastModeProviderOptionsPatch,
  isFastModeSupportedForModel,
} from './model-fast-mode-capabilities';

describe('isFastModeSupportedForModel', () => {
  it('returns true for OpenRouter instances', () => {
    expect(
      isFastModeSupportedForModel({
        modelId: 'anthropic/claude-opus-4.8',
        providerTypeId: 'openrouter',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'meta-llama/llama-3.3-70b',
        providerTypeId: 'openrouter',
      }),
    ).toBe(true);
  });

  it('identifies supported Anthropic models', () => {
    expect(
      isFastModeSupportedForModel({
        modelId: 'claude-opus-4.8',
        vendor: 'anthropic',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'claude-sonnet-4.6',
        providerTypeId: 'custom-anthropic',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'claude-haiku-3.5',
        vendor: 'anthropic',
      }),
    ).toBe(false);
  });

  it('identifies supported OpenAI models', () => {
    expect(
      isFastModeSupportedForModel({
        modelId: 'gpt-5.4',
        vendor: 'openai',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'gpt-4o',
        providerTypeId: 'custom-openai-chat',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'o3-high',
        vendor: 'openai',
      }),
    ).toBe(true);
    expect(
      isFastModeSupportedForModel({
        modelId: 'gpt-3.5-turbo',
        vendor: 'openai',
      }),
    ).toBe(false);
  });
});

describe('createFastModeProviderOptionsPatch', () => {
  it('returns empty object when disabled', () => {
    expect(
      createFastModeProviderOptionsPatch({
        vendor: 'anthropic',
        enabled: false,
      }),
    ).toEqual({});
  });

  it('returns openrouter sort: throughput for OpenRouter even with openai apiSpec', () => {
    expect(
      createFastModeProviderOptionsPatch({
        providerTypeId: 'openrouter',
        apiSpec: 'openai-chat-completions',
        enabled: true,
      }),
    ).toEqual({
      openrouter: {
        sort: 'throughput',
      },
    });
  });

  it('returns anthropic serviceTier: auto for Anthropic', () => {
    expect(
      createFastModeProviderOptionsPatch({
        vendor: 'anthropic',
        enabled: true,
      }),
    ).toEqual({
      anthropic: {
        serviceTier: 'auto',
      },
    });
  });

  it('returns openai serviceTier: priority for OpenAI', () => {
    expect(
      createFastModeProviderOptionsPatch({
        vendor: 'openai',
        enabled: true,
      }),
    ).toEqual({
      openai: {
        serviceTier: 'priority',
      },
    });
  });
});
