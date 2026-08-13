import { describe, expect, it } from 'vitest';
import { defaultUserPreferences } from './karton-contracts/ui/shared-types';
import { getSelectableImageModelEntries } from './available-image-models';

describe('getSelectableImageModelEntries', () => {
  it('returns only enabled image models owned by provider instances', () => {
    const preferences = structuredClone(defaultUserPreferences);
    preferences.providerInstances = [
      {
        id: 'openrouter-1',
        name: 'OpenRouter',
        typeId: 'openrouter',
        config: { encryptedApiKey: 'encrypted-key' },
        enabledModelIds: [],
        disabledModelIds: [],
        enabledImageModelIds: ['vendor/image-model'],
        discoveredModels: [{ modelId: 'chat-only', displayName: 'Chat only' }],
        imageModels: [
          {
            modelId: 'vendor/image-model',
            displayName: 'Image model',
            supportedParameters: {},
          },
          {
            modelId: 'vendor/disabled-image',
            displayName: 'Disabled image model',
            supportedParameters: {},
          },
        ],
      },
    ];

    const entries = getSelectableImageModelEntries(
      preferences.providerInstances,
    );

    expect(entries.some((entry) => entry.modelId === 'chat-only')).toBe(false);
    expect(entries).toContainEqual(
      expect.objectContaining({
        instanceId: 'openrouter-1',
        modelId: 'vendor/image-model',
      }),
    );
    expect(
      entries.some((entry) => entry.modelId === 'vendor/disabled-image'),
    ).toBe(false);
  });

  it('does not expose models from API-key providers without credentials', () => {
    const preferences = structuredClone(defaultUserPreferences);
    preferences.providerInstances = [
      {
        id: 'openai-1',
        name: 'OpenAI',
        typeId: 'openai-api',
        config: {},
        enabledModelIds: [],
        disabledModelIds: [],
        enabledImageModelIds: ['gpt-image-2'],
        discoveredModels: [],
        imageModels: [
          {
            modelId: 'gpt-image-2',
            displayName: 'GPT Image 2',
            supportedParameters: {},
          },
        ],
      },
    ];

    expect(
      getSelectableImageModelEntries(preferences.providerInstances),
    ).toEqual([]);
  });
});
