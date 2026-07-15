import { describe, expect, it } from 'vitest';
import {
  defaultUserPreferences,
  type ProviderInstance,
} from './karton-contracts/ui/shared-types';
import {
  findInstanceForVendor,
  getInstanceThinkingDefaultOptions,
  getVendorInstanceId,
  getVendorMode,
  vendorHasApiKey,
} from './provider-instance-helpers';
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

function createPreferences() {
  return structuredClone(defaultUserPreferences);
}

function createVendorApiInstance(): ProviderInstance {
  return {
    id: 'z-ai-api-default',
    typeId: 'z-ai-api',
    name: 'Z.AI API',
    config: { encryptedApiKey: 'encrypted-key' },
    enabledModelIds: [],
    disabledModelIds: [],
    discoveredModels: [],
  };
}

describe('vendor instance routing', () => {
  it('prefers a concrete vendor API instance over stale stagewise state', () => {
    const preferences = createPreferences();
    const instance = createVendorApiInstance();
    preferences.providerInstances = [instance];

    expect(findInstanceForVendor(preferences, 'z-ai')).toBe(instance);
    expect(getVendorInstanceId(preferences, 'z-ai')).toBe(instance.id);
    expect(vendorHasApiKey(preferences, 'z-ai')).toBe(true);
    expect(getVendorMode(preferences, 'z-ai')).toBe('official');
  });

  it('prefers a coding plan over an earlier vendor API instance', () => {
    const preferences = createPreferences();
    const apiInstance = createVendorApiInstance();
    const planInstance: ProviderInstance = {
      id: 'coding-plan:glm-coding-plan',
      typeId: 'coding-plan',
      name: 'GLM Coding Plan',
      config: {
        encryptedApiKey: 'plan-key',
        planId: 'glm-coding-plan',
        baseUrl: 'https://api.z.ai/api/coding/paas/v4',
      },
      enabledModelIds: [],
      disabledModelIds: [],
      discoveredModels: [],
    };
    preferences.providerInstances = [apiInstance, planInstance];

    expect(findInstanceForVendor(preferences, 'z-ai')).toBe(planInstance);
    expect(getVendorInstanceId(preferences, 'z-ai')).toBe(planInstance.id);
    expect(vendorHasApiKey(preferences, 'z-ai')).toBe(true);
    expect(getVendorMode(preferences, 'z-ai')).toBe('official');
  });

  it('uses the explicit custom-provider link for custom mode', () => {
    const preferences = createPreferences();
    const instance: ProviderInstance = {
      id: 'z-ai-custom',
      typeId: 'custom-openai-chat',
      name: 'Z.AI Custom',
      config: {
        baseUrl: 'https://example.com/v1',
        encryptedApiKey: 'custom-key',
      },
      enabledModelIds: [],
      disabledModelIds: [],
      discoveredModels: [],
    };
    preferences.providerConfigs['z-ai'] = {
      mode: 'custom',
      customProviderId: instance.id,
    };
    preferences.providerInstances = [instance];

    expect(findInstanceForVendor(preferences, 'z-ai')).toBe(instance);
    expect(getVendorInstanceId(preferences, 'z-ai')).toBe(instance.id);
    expect(vendorHasApiKey(preferences, 'z-ai')).toBe(true);
    expect(getVendorMode(preferences, 'z-ai')).toBe('custom');
  });

  it('falls back without a concrete instance', () => {
    const preferences = createPreferences();

    expect(findInstanceForVendor(preferences, 'z-ai')).toBeUndefined();
    expect(getVendorInstanceId(preferences, 'z-ai')).toBeUndefined();
    expect(vendorHasApiKey(preferences, 'z-ai')).toBe(false);
    expect(getVendorMode(preferences, 'z-ai')).toBe('stagewise');
  });
});
