import { describe, expect, it } from 'vitest';
import {
  createThinkingProviderOptionsPatch,
  getEffectiveThinkingSelection,
  getSupportedThinkingOptions,
  type ThinkingCapableModel,
} from './model-thinking-capabilities';

const openAiModel: ThinkingCapableModel = {
  modelId: 'gpt-5.5',
  officialProvider: 'openai',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    openai: { reasoningEffort: 'medium', reasoningSummary: 'auto' },
  },
};

const googleProModel: ThinkingCapableModel = {
  modelId: 'gemini-3.1-pro-preview',
  officialProvider: 'google',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    google: {
      thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
    },
  },
};

const googleFlashModel: ThinkingCapableModel = {
  modelId: 'gemini-3-flash-preview',
  officialProvider: 'google',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    google: {
      thinkingConfig: { includeThoughts: true, thinkingLevel: 'medium' },
    },
  },
};

const anthropicOpusModel: ThinkingCapableModel = {
  modelId: 'claude-opus-4.8',
  officialProvider: 'anthropic',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
  },
};

const anthropicConservativeModel: ThinkingCapableModel = {
  modelId: 'claude-opus-4.6',
  officialProvider: 'anthropic',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'medium' } },
    anthropic: { thinking: { type: 'adaptive' }, effort: 'medium' },
  },
};

const glm52Model: ThinkingCapableModel = {
  modelId: 'glm-5.2',
  officialProvider: 'z-ai',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: { reasoning: { enabled: true, effort: 'max' } },
    openai: { reasoningEffort: 'max' },
  },
};

describe('model thinking capabilities', () => {
  it('coerces unsupported OpenAI minimal away from provider options', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: openAiModel,
        route: { providerMode: 'official', modelProvider: 'openai' },
        override: { enabled: true, provider: 'openai', value: 'minimal' },
      }),
    ).toEqual({ openai: { reasoningEffort: 'medium' } });
  });

  it('emits OpenAI none when gpt-5.5 thinking is disabled', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: openAiModel,
        route: { providerMode: 'official', modelProvider: 'openai' },
        override: { enabled: false, provider: 'openai', value: 'high' },
      }),
    ).toEqual({
      openai: { reasoningEffort: 'none', reasoningSummary: undefined },
    });
  });

  it('emits OpenAI xhigh for gpt-5.5 extra high', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: openAiModel,
        route: { providerMode: 'official', modelProvider: 'openai' },
        override: { enabled: true, provider: 'openai', value: 'xhigh' },
      }),
    ).toEqual({ openai: { reasoningEffort: 'xhigh' } });
  });

  it('uses model-specific Google thinking option sets', () => {
    expect(
      getSupportedThinkingOptions(googleProModel, {
        providerMode: 'official',
        modelProvider: 'google',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high']);

    expect(
      getSupportedThinkingOptions(googleFlashModel, {
        providerMode: 'official',
        modelProvider: 'google',
      }).map((option) => option.value),
    ).toEqual(['minimal', 'low', 'medium', 'high']);
  });

  it('never emits Google xhigh', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: googleProModel,
        route: { providerMode: 'official', modelProvider: 'google' },
        override: { enabled: true, provider: 'google', value: 'xhigh' },
      }),
    ).toEqual({
      google: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: 'high' },
      },
    });
  });

  it('filters Anthropic advanced values by model family', () => {
    expect(
      getSupportedThinkingOptions(anthropicOpusModel, {
        providerMode: 'official',
        modelProvider: 'anthropic',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);

    expect(
      getSupportedThinkingOptions(anthropicConservativeModel, {
        providerMode: 'official',
        modelProvider: 'anthropic',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('emits Anthropic max for supported adaptive models', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: anthropicOpusModel,
        route: { providerMode: 'official', modelProvider: 'anthropic' },
        override: { enabled: true, provider: 'anthropic', value: 'max' },
      }),
    ).toEqual({ anthropic: { thinking: { type: 'adaptive' }, effort: 'max' } });
  });

  it('uses Anthropic-native options for Stagewise-routed Claude models', () => {
    expect(
      getSupportedThinkingOptions(anthropicOpusModel, {
        providerMode: 'stagewise',
        modelProvider: 'anthropic',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
  });

  it('emits Anthropic patches for Stagewise-routed Claude overrides', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: anthropicOpusModel,
        route: { providerMode: 'stagewise', modelProvider: 'anthropic' },
        override: { enabled: true, provider: 'anthropic', value: 'max' },
      }),
    ).toEqual({ anthropic: { thinking: { type: 'adaptive' }, effort: 'max' } });
  });

  it('applies valid legacy Stagewise overrides in Stagewise provider-native mode', () => {
    expect(
      getEffectiveThinkingSelection(
        anthropicOpusModel,
        { enabled: true, provider: 'stagewise', value: 'high' },
        { providerMode: 'stagewise', modelProvider: 'anthropic' },
      ),
    ).toMatchObject({ provider: 'anthropic', value: 'high' });
  });

  it('falls back for invalid legacy Stagewise overrides in provider-native mode', () => {
    expect(
      getEffectiveThinkingSelection(
        anthropicOpusModel,
        { enabled: true, provider: 'stagewise', value: 'minimal' },
        { providerMode: 'stagewise', modelProvider: 'anthropic' },
      ),
    ).toMatchObject({ provider: 'anthropic', value: 'medium' });
  });

  it('uses conservative values for OpenAI-compatible providers', () => {
    expect(
      getSupportedThinkingOptions('kimi-k2-thinking', {
        providerMode: 'official',
        modelProvider: 'moonshotai',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high']);
  });

  it('exposes max reasoning for GLM 5.2 on OpenAI-compatible routes', () => {
    expect(
      getSupportedThinkingOptions(glm52Model, {
        providerMode: 'official',
        modelProvider: 'z-ai',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high', 'max']);
  });

  it('emits OpenAI-compatible max reasoning for GLM 5.2', () => {
    expect(
      createThinkingProviderOptionsPatch({
        model: glm52Model,
        route: { providerMode: 'official', modelProvider: 'z-ai' },
        override: {
          enabled: true,
          provider: 'openai-compatible',
          value: 'max',
        },
      }),
    ).toEqual({ openai: { reasoningEffort: 'max' } });
  });

  it('uses OpenAI-compatible values for custom chat completions endpoints', () => {
    expect(
      getSupportedThinkingOptions('gpt-5.5', {
        providerMode: 'custom',
        modelProvider: 'openai',
        customEndpointApiSpec: 'openai-chat-completions',
      }).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high']);
  });
});
