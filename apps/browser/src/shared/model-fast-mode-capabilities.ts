import type {
  ApiSpec,
  ModelProvider,
  ProviderInstanceTypeId,
} from './karton-contracts/ui/shared-types';

/**
 * Checks if a model and route support fast mode (latency priority / high throughput).
 */
export function isFastModeSupportedForModel(args: {
  modelId: string;
  vendor?: ModelProvider;
  apiSpec?: ApiSpec;
  providerTypeId?: ProviderInstanceTypeId | string;
}): boolean {
  const { modelId, vendor, apiSpec, providerTypeId } = args;

  // OpenRouter supports :nitro throughput routing on all models
  if (providerTypeId === 'openrouter') {
    return true;
  }

  // Custom Anthropic endpoints support fast mode for all user-defined models
  if (providerTypeId === 'custom-anthropic') {
    return true;
  }

  // Anthropic API / official vendor
  if (
    vendor === 'anthropic' ||
    apiSpec === 'anthropic' ||
    providerTypeId === 'anthropic-api'
  ) {
    return (
      modelId.startsWith('claude-opus') ||
      modelId.startsWith('claude-sonnet') ||
      modelId.startsWith('claude-fable') ||
      modelId.startsWith('claude-mythos')
    );
  }

  // Custom OpenAI or Azure endpoints support fast mode for all user-configured models
  if (
    providerTypeId === 'custom-openai-chat' ||
    providerTypeId === 'custom-openai-responses' ||
    providerTypeId === 'azure'
  ) {
    return true;
  }

  // OpenAI API / official vendor
  if (
    vendor === 'openai' ||
    apiSpec === 'openai-chat-completions' ||
    apiSpec === 'openai-responses' ||
    apiSpec === 'azure' ||
    providerTypeId === 'openai-api'
  ) {
    return (
      modelId.startsWith('gpt-5') ||
      modelId.startsWith('gpt-4o') ||
      modelId.startsWith('o1') ||
      modelId.startsWith('o3') ||
      modelId.startsWith('o4-mini')
    );
  }

  return false;
}

/**
 * Creates the providerOptions patch when fast mode is enabled or disabled.
 */
export function createFastModeProviderOptionsPatch(args: {
  vendor?: ModelProvider;
  apiSpec?: ApiSpec;
  providerTypeId?: ProviderInstanceTypeId | string;
  enabled: boolean;
}): Record<string, unknown> {
  const { vendor, apiSpec, providerTypeId, enabled } = args;

  if (!enabled) {
    return {};
  }

  if (providerTypeId === 'openrouter') {
    return {
      openrouter: {
        sort: 'throughput',
      },
    };
  }

  if (
    vendor === 'anthropic' ||
    apiSpec === 'anthropic' ||
    providerTypeId === 'anthropic-api' ||
    providerTypeId === 'custom-anthropic'
  ) {
    return {
      anthropic: {
        serviceTier: 'auto',
      },
    };
  }

  if (
    vendor === 'openai' ||
    apiSpec === 'openai-chat-completions' ||
    apiSpec === 'openai-responses' ||
    apiSpec === 'azure' ||
    providerTypeId === 'openai-api' ||
    providerTypeId === 'custom-openai-chat' ||
    providerTypeId === 'custom-openai-responses' ||
    providerTypeId === 'azure'
  ) {
    return {
      openai: {
        serviceTier: 'priority',
      },
    };
  }

  return {};
}
