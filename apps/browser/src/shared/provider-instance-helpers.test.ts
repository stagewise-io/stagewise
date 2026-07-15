import { describe, expect, it } from 'vitest';
import type { ProviderInstance } from './karton-contracts/ui/shared-types';
import { getInstanceThinkingDefaultOptions } from './provider-instance-helpers';
import { getSupportedThinkingOptions } from './model-thinking-capabilities';

const openrouterInstance: ProviderInstance = {
  id: 'openrouter-default',
  typeId: 'openrouter',
  name: 'OpenRouter',
  config: {},
  enabledModelIds: [],
  disabledModelIds: [],
  discoveredModels: [],
};

describe('getInstanceThinkingDefaultOptions', () => {
  it('uses the official route for OpenRouter', () => {
    expect(getInstanceThinkingDefaultOptions(openrouterInstance)).toEqual({
      providerMode: 'official',
    });
  });

  it('preserves official OpenAI thinking capabilities for OpenRouter', () => {
    const route = {
      ...getInstanceThinkingDefaultOptions(openrouterInstance),
      modelProvider: 'openai' as const,
    };

    expect(
      getSupportedThinkingOptions('gpt-5.5', route).map(
        (option) => option.value,
      ),
    ).toEqual(['none', 'low', 'medium', 'high', 'xhigh']);
  });
});
