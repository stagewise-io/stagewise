import { describe, expect, it } from 'vitest';
import {
  computeDisabledModelIdsAfterDiscovery,
  isFlagshipFilteringEnabled,
} from './flagship-models';
import type { DiscoveredModel } from './karton-contracts/ui/shared-types';

// -- Helpers ---------------------------------------------------------------

function makeDiscoveredModel(
  modelId: string,
  overrides: Partial<DiscoveredModel> = {},
): DiscoveredModel {
  return {
    modelId,
    displayName: modelId,
    ...overrides,
  };
}

// -- isFlagshipFilteringEnabled --------------------------------------------

describe('isFlagshipFilteringEnabled', () => {
  it('returns true for openrouter', () => {
    expect(isFlagshipFilteringEnabled('openrouter')).toBe(true);
  });

  it('returns false for coding-plan so discovered models remain enabled', () => {
    expect(isFlagshipFilteringEnabled('coding-plan')).toBe(false);
  });

  it('returns true for vendor API types (except anthropic)', () => {
    expect(isFlagshipFilteringEnabled('openai-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('google-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('deepseek-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('moonshotai-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('z-ai-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('minimax-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('xiaomi-mimo-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('mistral-api')).toBe(true);
    expect(isFlagshipFilteringEnabled('alibaba-api')).toBe(true);
  });

  it('returns false for anthropic-api (no discovery endpoint)', () => {
    expect(isFlagshipFilteringEnabled('anthropic-api')).toBe(false);
  });

  it('returns false for ollama (all user-pulled models are equal)', () => {
    expect(isFlagshipFilteringEnabled('ollama')).toBe(false);
  });

  it('returns false for stagewise (catalog-only)', () => {
    expect(isFlagshipFilteringEnabled('stagewise')).toBe(false);
  });

  it('returns false for custom/cloud types', () => {
    expect(isFlagshipFilteringEnabled('custom-openai-chat')).toBe(false);
    expect(isFlagshipFilteringEnabled('custom-anthropic')).toBe(false);
    expect(isFlagshipFilteringEnabled('azure')).toBe(false);
    expect(isFlagshipFilteringEnabled('bedrock')).toBe(false);
    expect(isFlagshipFilteringEnabled('vertex')).toBe(false);
  });
});

// -- computeDisabledModelIdsAfterDiscovery ---------------------------------

describe('computeDisabledModelIdsAfterDiscovery', () => {
  // -- OpenRouter ---------------------------------------------------------

  describe('OpenRouter', () => {
    it('disables non-flagship models on initial discovery', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('anthropic/claude-sonnet-5'),
        makeDiscoveredModel('openai/gpt-5.6-sol'),
        makeDiscoveredModel('openai/gpt-4o'),
        makeDiscoveredModel('openai/gpt-4o-mini'),
        makeDiscoveredModel('google/gemini-3.5-flash'),
        makeDiscoveredModel('perplexity/sonar'),
        makeDiscoveredModel('cohere/command-a'),
        makeDiscoveredModel('openai/gpt-5.6-luna-pro'),
        makeDiscoveredModel('deepseek/deepseek-chat'),
        makeDiscoveredModel('meta-llama/llama-4-405b'),
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openrouter',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      // Flagship: claude-sonnet-5, gpt-5.6-sol, gemini-3.5-flash → enabled
      // Non-flagship: 7 models → disabled
      expect(result).toHaveLength(7);
      expect(result).toContain('openai/gpt-4o');
      expect(result).toContain('openai/gpt-4o-mini');
      expect(result).toContain('perplexity/sonar');
      expect(result).toContain('cohere/command-a');
      expect(result).toContain('openai/gpt-5.6-luna-pro');
      expect(result).toContain('deepseek/deepseek-chat');
      expect(result).toContain('meta-llama/llama-4-405b');

      // Flagship models NOT in disabled list
      expect(result).not.toContain('anthropic/claude-sonnet-5');
      expect(result).not.toContain('openai/gpt-5.6-sol');
      expect(result).not.toContain('google/gemini-3.5-flash');
    });

    it('preserves existing user choices on refresh', () => {
      const oldDiscovered = [
        makeDiscoveredModel('anthropic/claude-sonnet-5'),
        makeDiscoveredModel('openai/gpt-4o'),
        makeDiscoveredModel('perplexity/sonar'),
      ];
      const oldDiscoveredIds = new Set(oldDiscovered.map((m) => m.modelId));

      // User enabled gpt-4o by removing it from disabled, and disabled
      // claude-sonnet-5 (user choice to hide a flagship model).
      const existingDisabled = [
        'perplexity/sonar',
        'anthropic/claude-sonnet-5',
      ];

      const newDiscovered: DiscoveredModel[] = [
        makeDiscoveredModel('anthropic/claude-sonnet-5'),
        makeDiscoveredModel('openai/gpt-4o'),
        makeDiscoveredModel('perplexity/sonar'),
        // New models
        makeDiscoveredModel('openai/gpt-5.6-sol'), // flagship
        makeDiscoveredModel('cohere/command-a'), // non-flagship
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openrouter',
        config: {},
        discoveredModels: newDiscovered,
        existingDisabledModelIds: existingDisabled,
        existingDiscoveredModelIds: oldDiscoveredIds,
      });

      // Existing: claude-sonnet-5 stays disabled (user choice), sonar stays
      // disabled (user choice), gpt-4o stays enabled (user choice).
      // New: gpt-5.6-sol enabled (flagship), cohere/command-a disabled.
      expect(result).toContain('anthropic/claude-sonnet-5');
      expect(result).toContain('perplexity/sonar');
      expect(result).toContain('cohere/command-a');
      expect(result).not.toContain('openai/gpt-4o');
      expect(result).not.toContain('openai/gpt-5.6-sol');
    });

    it('cleans up stale entries for models removed from discovery', () => {
      const oldDiscovered = [
        makeDiscoveredModel('openai/gpt-4o'),
        makeDiscoveredModel('cohere/command-a'),
      ];
      const oldDiscoveredIds = new Set(oldDiscovered.map((m) => m.modelId));

      const existingDisabled = ['openai/gpt-4o', 'cohere/command-a'];

      // gpt-4o removed from discovery, cohere/command-a still present.
      const newDiscovered: DiscoveredModel[] = [
        makeDiscoveredModel('cohere/command-a'),
        makeDiscoveredModel('anthropic/claude-sonnet-5'),
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openrouter',
        config: {},
        discoveredModels: newDiscovered,
        existingDisabledModelIds: existingDisabled,
        existingDiscoveredModelIds: oldDiscoveredIds,
      });

      // gpt-4o cleaned up (no longer discovered, not catalog).
      // cohere/command-a stays disabled.
      expect(result).not.toContain('openai/gpt-4o');
      expect(result).toContain('cohere/command-a');
    });

    it('does not filter free-tier variants as flagship', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('openai/gpt-5.6-sol'), // flagship
        makeDiscoveredModel('openai/gpt-5.6-sol:free'), // free variant - not flagship
        makeDiscoveredModel('nvidia/nemotron-3-ultra-550b-a55b'), // flagship
        makeDiscoveredModel('nvidia/nemotron-3-ultra-550b-a55b:free'), // free variant
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openrouter',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      expect(result).toContain('openai/gpt-5.6-sol:free');
      expect(result).toContain('nvidia/nemotron-3-ultra-550b-a55b:free');
      expect(result).not.toContain('openai/gpt-5.6-sol');
      expect(result).not.toContain('nvidia/nemotron-3-ultra-550b-a55b');
    });
  });

  // -- OpenAI API ---------------------------------------------------------

  describe('OpenAI API', () => {
    it('does not disable catalog models even if not in flagship set', () => {
      // gpt-5.4-mini and gpt-5.4-nano are catalog models.
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('gpt-5.6-sol'), // catalog
        makeDiscoveredModel('gpt-5.4-mini'), // catalog
        makeDiscoveredModel('o3'), // discovered-only flagship
        makeDiscoveredModel('gpt-4o'), // non-flagship discovered-only
        makeDiscoveredModel('gpt-4.1'), // non-flagship discovered-only
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openai-api',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      // Catalog models never disabled.
      expect(result).not.toContain('gpt-5.6-sol');
      expect(result).not.toContain('gpt-5.4-mini');

      // Discovered-only flagship: o3 enabled.
      expect(result).not.toContain('o3');

      // Non-flagship discovered-only: disabled.
      expect(result).toContain('gpt-4o');
      expect(result).toContain('gpt-4.1');
    });

    it('enables Pro variants as flagship', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('gpt-5.6-sol-pro'), // flagship
        makeDiscoveredModel('gpt-5.5-pro'), // flagship
        makeDiscoveredModel('gpt-5.4-pro'), // flagship
        makeDiscoveredModel('gpt-5.2'), // non-flagship
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openai-api',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      expect(result).not.toContain('gpt-5.6-sol-pro');
      expect(result).not.toContain('gpt-5.5-pro');
      expect(result).not.toContain('gpt-5.4-pro');
      expect(result).toContain('gpt-5.2');
    });
  });

  // -- Case insensitivity --------------------------------------------------

  describe('case insensitivity', () => {
    it('matches catalog models case-insensitively', () => {
      // MiniMax catalog has 'minimax-m3' but API may return 'MiniMax-M3'.
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('MiniMax-M3'), // catalog (lowercase: minimax-m3)
        makeDiscoveredModel('MiniMax-M2'), // catalog (lowercase: minimax-m2)
        makeDiscoveredModel('some-random-model'),
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'minimax-api',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      // Catalog models not disabled.
      expect(result).not.toContain('MiniMax-M3');
      expect(result).not.toContain('MiniMax-M2');
      // Non-catalog model disabled.
      expect(result).toContain('some-random-model');
    });
  });

  // -- Ollama (no filtering) ----------------------------------------------

  describe('Ollama', () => {
    it('does not filter — returns existing disabled list unchanged', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('llama3.3'),
        makeDiscoveredModel('qwen2.5'),
        makeDiscoveredModel('mistral'),
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'ollama',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      expect(result).toEqual([]);
    });
  });

  // -- Coding plan ---------------------------------------------------------

  describe('Coding plan', () => {
    it('keeps every newly discovered model enabled', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('glm-5.2'),
        makeDiscoveredModel('glm-new-model'),
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'coding-plan',
        config: { planId: 'glm-coding-plan' },
        discoveredModels: discovered,
        existingDisabledModelIds: [],
        existingDiscoveredModelIds: new Set(),
      });

      expect(result).toEqual([]);
    });
  });

  // -- User choice preservation on refresh ---------------------------------

  describe('User choice preservation on refresh', () => {
    it('preserves user-enabled non-flagship model after refresh', () => {
      const oldDiscovered = [
        makeDiscoveredModel('openai/gpt-4o'), // non-flagship
      ];
      const oldDiscoveredIds = new Set(oldDiscovered.map((m) => m.modelId));

      // User manually enabled gpt-4o (removed it from disabled).
      const existingDisabled: string[] = [];

      const newDiscovered: DiscoveredModel[] = [
        makeDiscoveredModel('openai/gpt-4o'), // still present
        makeDiscoveredModel('cohere/command-a'), // new non-flagship
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openrouter',
        config: {},
        discoveredModels: newDiscovered,
        existingDisabledModelIds: existingDisabled,
        existingDiscoveredModelIds: oldDiscoveredIds,
      });

      // gpt-4o stays enabled (user choice preserved).
      expect(result).not.toContain('openai/gpt-4o');
      // cohere/command-a auto-disabled (new non-flagship).
      expect(result).toContain('cohere/command-a');
    });

    it('preserves user-disabled catalog model even if stale', () => {
      // User disabled a catalog model (e.g. gpt-5.4-mini).
      const oldDiscoveredIds = new Set(['gpt-5.4-mini']);
      const existingDisabled = ['gpt-5.4-mini'];

      // On refresh, gpt-5.4-mini disappears from discovery.
      const newDiscovered: DiscoveredModel[] = [
        makeDiscoveredModel('gpt-5.6-sol'), // catalog
      ];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'openai-api',
        config: {},
        discoveredModels: newDiscovered,
        existingDisabledModelIds: existingDisabled,
        existingDiscoveredModelIds: oldDiscoveredIds,
      });

      // gpt-5.4-mini stays disabled (catalog model, not cleaned up).
      expect(result).toContain('gpt-5.4-mini');
    });
  });

  // -- Anthropic API (no filtering) ----------------------------------------

  describe('Anthropic API', () => {
    it('does not filter — returns existing disabled list unchanged', () => {
      const discovered: DiscoveredModel[] = [
        makeDiscoveredModel('claude-opus-4.8'),
        makeDiscoveredModel('claude-sonnet-5'),
      ];

      const existingDisabled = ['claude-haiku-4.5'];

      const result = computeDisabledModelIdsAfterDiscovery({
        typeId: 'anthropic-api',
        config: {},
        discoveredModels: discovered,
        existingDisabledModelIds: existingDisabled,
        existingDiscoveredModelIds: new Set(),
      });

      expect(result).toEqual(existingDisabled);
    });
  });
});
