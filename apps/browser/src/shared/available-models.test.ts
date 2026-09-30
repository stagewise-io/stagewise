import { describe, expect, it } from 'vitest';
import {
  availableModels,
  getModelCapabilities,
  getSelectableBuiltInModels,
  availableModelAliases,
  resolveModelAlias,
} from './available-models';

describe('model aliases', () => {
  it('resolves aliases to their target model IDs', () => {
    expect(resolveModelAlias('default')).toBe('deepseek-v4-pro');
    expect(resolveModelAlias('smart')).toBe('glm-5.2');
    expect(resolveModelAlias('quick')).toBe('gemini-3.5-flash');
    expect(resolveModelAlias('gpt-5.5')).toBe('gpt-5.5');
  });

  it('keeps aliases first in the selectable built-in model list', () => {
    const selectableModels = getSelectableBuiltInModels();

    expect(
      selectableModels
        .slice(0, availableModelAliases.length)
        .map((model) => model.modelId),
    ).toEqual(availableModelAliases.map((alias) => alias.modelId));
  });

  it('keeps aliases visible even when their target models are disabled', () => {
    const selectableModelIds = getSelectableBuiltInModels({
      disabledModelIds: ['deepseek-v4-pro'],
    }).map((model) => model.modelId);

    // Aliases are always available regardless of target model disabled state
    expect(selectableModelIds).toContain('default');
    expect(selectableModelIds).toContain('quick');
    expect(selectableModelIds).toContain('smart');
    // The disabled target model itself is still hidden
    expect(selectableModelIds).not.toContain('deepseek-v4-pro');
  });

  it('returns target model capabilities for alias IDs', () => {
    for (const alias of availableModelAliases) {
      expect(getModelCapabilities(alias.modelId)).toEqual(
        getModelCapabilities(alias.targetModelId),
      );
    }
  });

  it('defines fixed thinking presets for aliases', () => {
    expect(
      Object.fromEntries(
        availableModelAliases.map((alias) => [
          alias.modelId,
          alias.thinkingPreset,
        ]),
      ),
    ).toEqual({
      default: { enabled: true, value: 'medium' },
      quick: { enabled: true, value: 'low' },
      smart: { enabled: true, value: 'xhigh' },
    });
  });

  it('includes Claude Sonnet 5.5 with current API metadata', () => {
    const sonnet = availableModels.find(
      (model) => model.modelId === 'claude-sonnet-5.5',
    );

    expect(sonnet).toMatchObject({
      modelDisplayName: 'Sonnet 5.5',
      modelContextRaw: 1000000,
      thinkingEnabled: true,
      providerOptions: {
        anthropic: { thinking: { type: 'adaptive' }, effort: 'high' },
      },
      pricing: {
        inputPerMillion: 2,
        outputPerMillion: 10,
        relativeMultiplier: 2,
      },
      capabilities: {
        inputModalities: { text: true, image: true, file: true },
        toolCalling: true,
      },
    });
  });

  it('includes the latest GPT-6 family with expected pricing and context', () => {
    expect(
      Object.fromEntries(
        availableModels
          .filter((model) =>
            ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'].includes(
              model.modelId,
            ),
          )
          .map((model) => [
            model.modelId,
            {
              context: model.modelContextRaw,
              input: model.pricing.inputPerMillion,
              output: model.pricing.outputPerMillion,
            },
          ]),
      ),
    ).toEqual({
      'gpt-6.1-sol': { context: 1050000, input: 2, output: 10 },
      'gpt-6-astra': { context: 1050000, input: 10, output: 50 },
      'gpt-6-sol': { context: 1050000, input: 2, output: 10 },
      'gpt-6-luna': { context: 1050000, input: 0.1, output: 0.5 },
    });
  });

  it('defines aliases for existing built-in target models', () => {
    const availableModelIds = new Set(
      availableModels.map((model) => model.modelId),
    );

    for (const alias of availableModelAliases) {
      expect(availableModelIds.has(alias.targetModelId)).toBe(true);
    }
  });
});
