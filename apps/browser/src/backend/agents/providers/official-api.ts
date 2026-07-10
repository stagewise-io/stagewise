import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  ApiSpec,
  ModelProvider,
} from '@shared/karton-contracts/ui/shared-types';
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
// Display + URL metadata (consolidated from PROVIDER_DISPLAY_INFO,
// PROVIDER_OFFICIAL_URLS, and API_KEY_URLS)
// ============================================================================

type VendorMeta = {
  displayName: string;
  description: string;
  getApiKeyUrl?: string;
  defaultBaseUrl?: string;
};

const VENDOR_META: Record<ModelProvider, VendorMeta> = {
  anthropic: {
    displayName: 'Anthropic',
    description: 'Claude models (Opus, Sonnet, Haiku)',
    getApiKeyUrl: 'https://console.anthropic.com/settings/keys',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
  openai: {
    displayName: 'OpenAI',
    description: 'GPT and Codex models',
    getApiKeyUrl: 'https://platform.openai.com/api-keys',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  google: {
    displayName: 'Google',
    description: 'Gemini models',
    getApiKeyUrl: 'https://aistudio.google.com/app/apikey',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  moonshotai: {
    displayName: 'Moonshot AI',
    description: 'Kimi models',
    getApiKeyUrl: 'https://platform.moonshot.ai/console/api-keys',
    defaultBaseUrl: 'https://api.moonshot.ai/v1',
  },
  alibaba: {
    displayName: 'Alibaba Cloud',
    description: 'Qwen models',
    getApiKeyUrl: 'https://dashscope.console.aliyuncs.com/apiKey',
    defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  },
  deepseek: {
    displayName: 'DeepSeek',
    description: 'DeepSeek V-series models',
    getApiKeyUrl: 'https://platform.deepseek.com/api_keys',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  'z-ai': {
    displayName: 'Z.ai',
    description: 'GLM models',
    getApiKeyUrl: 'https://z.ai/manage-apikey/apikey-list',
    defaultBaseUrl: 'https://api.z.ai/api/paas/v4',
  },
  minimax: {
    displayName: 'MiniMax',
    description: 'MiniMax M-series models',
    getApiKeyUrl:
      'https://platform.minimax.io/user-center/basic-information/interface-key',
    defaultBaseUrl: 'https://api.minimax.io/v1',
  },
  'xiaomi-mimo': {
    displayName: 'Xiaomi MiMo',
    description: 'MiMo V2.5-series models',
    getApiKeyUrl: 'https://platform.xiaomimimo.com/#/console/plan-manage',
    defaultBaseUrl: 'https://api.xiaomimimo.com/v1',
  },
  mistral: {
    displayName: 'Mistral',
    description: 'Mistral AI models',
    getApiKeyUrl: 'https://console.mistral.ai/api-keys',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
  },
};

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
  ...VENDOR_META.anthropic,
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
  ...VENDOR_META.openai,
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
  ...VENDOR_META.google,
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
  ...VENDOR_META.minimax,
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
  const meta = VENDOR_META[vendor];
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
