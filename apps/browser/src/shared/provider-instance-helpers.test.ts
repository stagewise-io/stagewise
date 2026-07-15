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
  it('uses the OpenAI-compatible official route for OpenRouter', () => {
    expect(getInstanceThinkingDefaultOptions(openrouterInstance)).toEqual({
      providerMode: 'official',
      modelProvider: 'openai',
      thinkingProvider: 'openai-compatible',
    });
  });

  it('uses OpenAI-compatible thinking capabilities for OpenRouter', () => {
    expect(
      getSupportedThinkingOptions(
        'gpt-5.5',
        getInstanceThinkingDefaultOptions(openrouterInstance),
      ).map((option) => option.value),
    ).toEqual(['low', 'medium', 'high']);
  });
});
