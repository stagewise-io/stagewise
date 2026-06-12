import { describe, expect, it } from 'vitest';
import type { BuiltInModelForThinking } from './model-thinking';
import {
  getDefaultThinkingOption,
  getEnabledModelThinkingOption,
  getModelThinkingDisplayState,
  getModelThinkingOptions,
  getNextModelThinkingOption,
} from './model-thinking';

const thinkingModel = {
  modelId: 'thinking-model',
  modelDisplayName: 'Thinking Model',
  modelDescription: 'A model with thinking support.',
  modelContext: '100k context',
  officialProvider: 'anthropic',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: {
      reasoning: {
        enabled: true,
        effort: 'high',
      },
    },
  },
} as unknown as BuiltInModelForThinking;

const nonThinkingModel = {
  modelId: 'standard-model',
  modelDisplayName: 'Standard Model',
  modelDescription: 'A model without thinking support.',
  modelContext: '100k context',
  officialProvider: 'openai',
  providerOptions: {},
} as unknown as BuiltInModelForThinking;

const googleThinkingModel = {
  modelId: 'gemini-3.1-pro-preview',
  modelDisplayName: 'Google Thinking Model',
  modelDescription: 'A Google model with provider-specific thinking defaults.',
  modelContext: '1M context',
  officialProvider: 'google',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: {
      reasoning: {
        enabled: true,
        effort: 'medium',
      },
    },
    google: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingLevel: 'high',
      },
    },
  },
} as unknown as BuiltInModelForThinking;

const anthropicMaxThinkingModel = {
  modelId: 'claude-opus-4.8',
  modelDisplayName: 'Claude Opus 4.8',
  modelDescription: 'Anthropic adaptive reasoning model.',
  modelContext: '1M context',
  officialProvider: 'anthropic',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: {
      reasoning: {
        enabled: true,
        effort: 'medium',
      },
    },
    anthropic: {
      thinking: { type: 'adaptive' },
      effort: 'medium',
    },
  },
} as unknown as BuiltInModelForThinking;

const openAiThinkingModel = {
  modelId: 'gpt-5.5',
  modelDisplayName: 'GPT-5.5',
  modelDescription: 'OpenAI reasoning model.',
  modelContext: '1M context',
  officialProvider: 'openai',
  thinkingEnabled: true,
  providerOptions: {
    stagewise: {
      reasoning: {
        enabled: true,
        effort: 'medium',
      },
    },
    openai: {
      reasoningEffort: 'medium',
    },
  },
} as unknown as BuiltInModelForThinking;

describe('model thinking display helpers', () => {
  it('returns null for models without thinking support', () => {
    expect(getModelThinkingDisplayState(nonThinkingModel)).toBeNull();
  });

  it('uses the catalog default value when no override exists', () => {
    expect(getModelThinkingDisplayState(thinkingModel)).toEqual({
      enabled: true,
      provider: 'anthropic',
      value: 'high',
      label: 'High',
      isOverride: false,
    });
  });

  it('uses active provider-specific defaults outside stagewise mode', () => {
    expect(
      getModelThinkingDisplayState(googleThinkingModel, undefined, {
        providerMode: 'official',
      }),
    ).toEqual({
      enabled: true,
      provider: 'google',
      value: 'high',
      label: 'High',
      isOverride: false,
    });
  });

  it('uses provider-native defaults in stagewise mode for known providers', () => {
    expect(
      getModelThinkingDisplayState(googleThinkingModel, undefined, {
        providerMode: 'stagewise',
      }),
    ).toEqual({
      enabled: true,
      provider: 'google',
      value: 'high',
      label: 'High',
      isOverride: false,
    });
  });

  it('uses the override value when present', () => {
    expect(
      getModelThinkingDisplayState(thinkingModel, {
        provider: 'stagewise',
        value: 'high',
      }),
    ).toEqual({
      enabled: true,
      provider: 'anthropic',
      value: 'high',
      label: 'High',
      isOverride: true,
    });
  });

  it('shows disabled overrides as off', () => {
    expect(
      getModelThinkingDisplayState(thinkingModel, {
        enabled: false,
        provider: 'stagewise',
        value: 'low',
      }),
    ).toEqual({
      enabled: false,
      provider: 'anthropic',
      value: 'low',
      label: 'Off',
      isOverride: true,
    });
  });

  it('treats empty overrides as defaults', () => {
    expect(getModelThinkingDisplayState(thinkingModel, {})).toEqual({
      enabled: true,
      provider: 'anthropic',
      value: 'high',
      label: 'High',
      isOverride: false,
    });
  });

  it('cycles thinking values in provider-supported display order', () => {
    expect(
      getNextModelThinkingOption(openAiThinkingModel, 'none', {
        providerMode: 'official',
      }).value,
    ).toBe('low');
    expect(
      getNextModelThinkingOption(openAiThinkingModel, 'low', {
        providerMode: 'official',
      }).value,
    ).toBe('medium');
    expect(
      getNextModelThinkingOption(openAiThinkingModel, 'medium', {
        providerMode: 'official',
      }).value,
    ).toBe('high');
    expect(
      getNextModelThinkingOption(openAiThinkingModel, 'high', {
        providerMode: 'official',
      }).value,
    ).toBe('xhigh');
    expect(
      getNextModelThinkingOption(openAiThinkingModel, 'xhigh', {
        providerMode: 'official',
      }).value,
    ).toBe('none');
  });

  it('maps Anthropic budget token defaults to the closest value', () => {
    const model = {
      ...thinkingModel,
      providerOptions: {
        stagewise: {
          reasoning: {
            enabled: true,
            effort: 'medium',
          },
        },
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: 20000,
          },
        },
      },
    } as unknown as BuiltInModelForThinking;

    expect(
      getDefaultThinkingOption(model, { providerMode: 'official' }),
    ).toMatchObject({
      provider: 'anthropic',
      value: 'high',
    });
  });

  it('falls back to medium when the catalog default is not supported', () => {
    const model = {
      ...thinkingModel,
      providerOptions: {
        stagewise: {
          reasoning: {
            enabled: true,
            effort: 'extreme',
          },
        },
      },
    } as unknown as BuiltInModelForThinking;

    expect(getDefaultThinkingOption(model)).toMatchObject({
      provider: 'anthropic',
      value: 'medium',
    });
    expect(getModelThinkingDisplayState(model)).toEqual({
      enabled: true,
      provider: 'anthropic',
      value: 'medium',
      label: 'Medium',
      isOverride: false,
    });
  });

  it('does not expose OpenAI minimal for gpt-5.5', () => {
    const values = getModelThinkingOptions(openAiThinkingModel, {
      providerMode: 'official',
    }).map((option) => option.value);

    expect(values).toEqual(['none', 'low', 'medium', 'high', 'xhigh']);
    expect(values).not.toContain('minimal');
  });

  it('uses an enabled fallback when enabling GPT-5 thinking', () => {
    expect(
      getEnabledModelThinkingOption(openAiThinkingModel, undefined, {
        providerMode: 'official',
      }),
    ).toMatchObject({ provider: 'openai', value: 'medium', enabled: true });

    expect(
      getEnabledModelThinkingOption(openAiThinkingModel, 'none', {
        providerMode: 'official',
      }),
    ).toMatchObject({ provider: 'openai', value: 'medium', enabled: true });
  });

  it('exposes Anthropic max for supported Claude models', () => {
    const expectedOptions = [
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
      ['xhigh', 'Extra high'],
      ['max', 'Max'],
    ];

    expect(
      getModelThinkingOptions(anthropicMaxThinkingModel, {
        providerMode: 'official',
      }).map((option) => [option.value, option.label]),
    ).toEqual(expectedOptions);
    expect(
      getModelThinkingOptions(anthropicMaxThinkingModel, {
        providerMode: 'stagewise',
      }).map((option) => [option.value, option.label]),
    ).toEqual(expectedOptions);
    expect(
      getModelThinkingDisplayState(
        anthropicMaxThinkingModel,
        { enabled: true, provider: 'anthropic', value: 'max' },
        { providerMode: 'stagewise' },
      ),
    ).toEqual({
      enabled: true,
      provider: 'anthropic',
      value: 'max',
      label: 'Max',
      isOverride: true,
    });
  });

  it('does not expose Google xhigh', () => {
    const values = getModelThinkingOptions(googleThinkingModel, {
      providerMode: 'official',
    }).map((option) => option.value);

    expect(values).toEqual(['low', 'medium', 'high']);
    expect(values).not.toContain('xhigh');
  });

  it('falls back safely for unsupported persisted values', () => {
    expect(
      getModelThinkingDisplayState(
        openAiThinkingModel,
        {
          enabled: true,
          provider: 'openai',
          value: 'minimal',
        },
        {
          providerMode: 'official',
        },
      ),
    ).toEqual({
      enabled: true,
      provider: 'openai',
      value: 'medium',
      label: 'Medium',
      isOverride: true,
    });
  });
});
