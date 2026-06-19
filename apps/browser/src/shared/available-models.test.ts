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

  it('defines aliases for existing built-in target models', () => {
    const availableModelIds = new Set(
      availableModels.map((model) => model.modelId),
    );

    for (const alias of availableModelAliases) {
      expect(availableModelIds.has(alias.targetModelId)).toBe(true);
    }
  });
});
