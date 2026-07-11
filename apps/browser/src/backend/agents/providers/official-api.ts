import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  ApiSpec,
  ModelProvider,
  ProviderInstanceTypeId,
} from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import {
  toNativeAnthropicModelId,
  toNativeMiniMaxModelId,
  createAnthropicModel,
  createOpenAIChatModel,
  createOpenAIResponsesModel,
  createGoogleModel,
} from './shared';

// ============================================================================
// Official API config — encrypted key + optional base URL override
// ============================================================================

export type OfficialApiConfig = {
  encryptedApiKey?: string;
  baseUrl?: string;
};

// ============================================================================
// Display metadata — sourced from the shared PROVIDER_TYPE_DISPLAY_INFO
// constant. No duplication here; each official-api type spreads from the
// shared record entry for its `${vendor}-api` typeId.
// ============================================================================

function vendorMeta(vendor: ModelProvider) {
  return PROVIDER_TYPE_DISPLAY_INFO[`${vendor}-api` as ProviderInstanceTypeId];
}

// ============================================================================
// Vendor → ApiSpec mapping (consolidated from VENDOR_TO_API_SPEC)
// ============================================================================

const VENDOR_TO_API_SPEC: Record<ModelProvider, ApiSpec> = {
  anthropic: 'anthropic',
  openai: 'openai-responses',
  google: 'google',
  moonshotai: 'openai-chat-completions',
  alibaba: 'openai-chat-completions',
  deepseek: 'openai-chat-completions',
  'z-ai': 'openai-chat-completions',
  minimax: 'openai-chat-completions',
  'xiaomi-mimo': 'openai-chat-completions',
  mistral: 'openai-chat-completions',
};

// ============================================================================
// Anthropic API type
// ============================================================================

export const anthropicApiType: ProviderType<OfficialApiConfig> = {
  id: 'anthropic-api',
  ...vendorMeta('anthropic'),
  category: 'official-api',
  vendor: 'anthropic',
  providerMode: 'official',
  apiSpec: VENDOR_TO_API_SPEC.anthropic,
  sensitiveFields: ['encryptedApiKey'],

  toWireModelId(modelId: string): string {
    return toNativeAnthropicModelId(modelId);
  },

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return {
      model: createAnthropicModel(apiKey, baseURL, modelId),
    };
  },
};

// ============================================================================
// OpenAI API type (responses API by default)
// ============================================================================

export const openaiApiType: ProviderType<OfficialApiConfig> = {
  id: 'openai-api',
  ...vendorMeta('openai'),
  category: 'official-api',
  vendor: 'openai',
  providerMode: 'official',
  apiSpec: VENDOR_TO_API_SPEC.openai,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return {
      model: createOpenAIResponsesModel(apiKey, baseURL, modelId),
    };
  },
};

// ============================================================================
// Google API type
// ============================================================================

export const googleApiType: ProviderType<OfficialApiConfig> = {
  id: 'google-api',
  ...vendorMeta('google'),
  category: 'official-api',
  vendor: 'google',
  providerMode: 'official',
  apiSpec: VENDOR_TO_API_SPEC.google,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return {
      model: createGoogleModel(apiKey, baseURL, modelId),
    };
  },
};

// ============================================================================
// MiniMax API type (uses native MiniMax model ID casing)
// ============================================================================

export const minimaxApiType: ProviderType<OfficialApiConfig> = {
  id: 'minimax-api',
  ...vendorMeta('minimax'),
  category: 'official-api',
  vendor: 'minimax',
  providerMode: 'official',
  apiSpec: VENDOR_TO_API_SPEC.minimax,
  sensitiveFields: ['encryptedApiKey'],

  toWireModelId(modelId: string): string {
    return toNativeMiniMaxModelId(modelId);
  },

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return {
      model: createOpenAIChatModel(apiKey, baseURL, modelId),
    };
  },
};

// ============================================================================
// Factory for the remaining 6 OpenAI-compatible vendors
// (moonshotai, alibaba, deepseek, z-ai, xiaomi-mimo, mistral)
// All use OpenAI Chat Completions with a default base URL fallback.
// ============================================================================

function createOpenAICompatibleApiType(
  vendor: ModelProvider,
): ProviderType<OfficialApiConfig> {
  const meta = vendorMeta(vendor);
  return {
    id: `${vendor}-api` as ProviderType['id'],
    ...meta,
    category: 'official-api',
    vendor,
    providerMode: 'official',
    apiSpec: VENDOR_TO_API_SPEC[vendor],
    sensitiveFields: ['encryptedApiKey'],

    createLanguageModel({ modelId, apiKey, baseURL }): {
      model: LanguageModelV3;
    } {
      return {
        model: createOpenAIChatModel(apiKey, baseURL, modelId),
      };
    },
  };
}

export const moonshotaiApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('moonshotai');

export const alibabaApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('alibaba');

export const deepseekApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('deepseek');

export const zAiApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('z-ai');

export const xiaomiMimoApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('xiaomi-mimo');

export const mistralApiType: ProviderType<OfficialApiConfig> =
  createOpenAICompatibleApiType('mistral');

// ============================================================================
// Registry of all official-api types, keyed by vendor
// ============================================================================

export const OFFICIAL_API_TYPES: Record<
  ModelProvider,
  ProviderType<OfficialApiConfig>
> = {
  anthropic: anthropicApiType,
  openai: openaiApiType,
  google: googleApiType,
  moonshotai: moonshotaiApiType,
  alibaba: alibabaApiType,
  deepseek: deepseekApiType,
  'z-ai': zAiApiType,
  minimax: minimaxApiType,
  'xiaomi-mimo': xiaomiMimoApiType,
  mistral: mistralApiType,
};

export const VENDOR_API_SPECS = VENDOR_TO_API_SPEC;
