import type { LanguageModelV3 } from '@ai-sdk/provider';
import type {
  ApiSpec,
  DiscoveredModel,
  ModelProvider,
  ProviderInstanceTypeId,
} from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import { generateText } from 'ai';
import {
  toNativeAnthropicModelId,
  toNativeMiniMaxModelId,
  createAnthropicModel,
  createOpenAIChatModel,
  createOpenAIResponsesModel,
  createGoogleModel,
  discoverOpenAICompatibleModels,
  discoverGoogleModels,
  discoverAnthropicModels,
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

/**
 * Per-vendor model ID used for the lightweight validation probe.
 * Must be a small/cheap model that every key can access.
 */
const VALIDATION_TIMEOUT_MS = 10_000;

const VENDOR_VALIDATION_MODEL: Partial<Record<ModelProvider, string>> = {
  anthropic: 'claude-haiku-4-5',
  deepseek: 'deepseek-chat',
  moonshotai: 'kimi-k2.6',
  alibaba: 'qwen-turbo',
  'z-ai': 'glm-4.5-flash',
  minimax: 'minimax-m2.7',
  'xiaomi-mimo': 'mimo-v2.5',
  mistral: 'mistral-small-latest',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
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

  async getInitialModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    return discoverAnthropicModels(
      config.baseUrl ?? vendorMeta('anthropic').defaultBaseUrl ?? '',
      decryptedConfig.encryptedApiKey ?? '',
    );
  },

  async refreshModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    return discoverAnthropicModels(
      config.baseUrl ?? vendorMeta('anthropic').defaultBaseUrl ?? '',
      decryptedConfig.encryptedApiKey ?? '',
    );
  },

  async validateCredentials(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseUrl = config.baseUrl ?? vendorMeta('anthropic').defaultBaseUrl;
    if (!baseUrl) {
      return {
        success: false,
        error: 'No base URL configured for Anthropic API',
      };
    }
    try {
      await generateText({
        model: createAnthropicModel(
          apiKey,
          baseUrl,
          VENDOR_VALIDATION_MODEL.anthropic!,
        ),
        messages: [{ role: 'user', content: 'Respond with one word.' }],
        abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Invalid Anthropic API key: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
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

  // ── Discovery ──────────────────────────────────────────────────────────

  async getInitialModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('openai').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenAICompatibleModels(baseUrl, apiKey, 'openai');
  },

  async refreshModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('openai').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenAICompatibleModels(baseUrl, apiKey, 'openai');
  },

  // ── Validation ─────────────────────────────────────────────────────────

  async validateCredentials(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseUrl = config.baseUrl ?? vendorMeta('openai').defaultBaseUrl;
    if (!baseUrl) {
      return { success: false, error: 'No base URL configured for OpenAI API' };
    }
    const validationModelId = VENDOR_VALIDATION_MODEL.openai!;
    try {
      await generateText({
        model: createOpenAIResponsesModel(apiKey, baseUrl, validationModelId),
        messages: [
          {
            role: 'user',
            content: 'What is the capital of France? Respond with one word.',
          },
        ],
        abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Invalid OpenAI API key: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  },

  // ── Model creation ─────────────────────────────────────────────────────

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

  // ── Discovery ──────────────────────────────────────────────────────────

  async getInitialModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('google').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverGoogleModels(baseUrl, apiKey);
  },

  async refreshModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('google').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverGoogleModels(baseUrl, apiKey);
  },

  // ── Validation ─────────────────────────────────────────────────────────

  async validateCredentials(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseUrl = config.baseUrl ?? vendorMeta('google').defaultBaseUrl;
    if (!baseUrl) {
      return { success: false, error: 'No base URL configured for Google API' };
    }
    const validationModelId = VENDOR_VALIDATION_MODEL.google!;
    try {
      await generateText({
        model: createGoogleModel(apiKey, baseUrl, validationModelId),
        messages: [
          {
            role: 'user',
            content: 'What is the capital of France? Respond with one word.',
          },
        ],
        abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Invalid Google API key: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  },

  // ── Model creation ─────────────────────────────────────────────────────

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

  // ── Discovery ──────────────────────────────────────────────────────────

  async getInitialModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('minimax').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenAICompatibleModels(baseUrl, apiKey, 'minimax');
  },

  async refreshModels(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl = config.baseUrl ?? vendorMeta('minimax').defaultBaseUrl;
    if (!baseUrl) return [];
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenAICompatibleModels(baseUrl, apiKey, 'minimax');
  },

  // ── Validation ─────────────────────────────────────────────────────────

  async validateCredentials(
    config: OfficialApiConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    const baseUrl = config.baseUrl ?? vendorMeta('minimax').defaultBaseUrl;
    if (!baseUrl) {
      return {
        success: false,
        error: 'No base URL configured for MiniMax API',
      };
    }
    const validationModelId = VENDOR_VALIDATION_MODEL.minimax!;
    try {
      await generateText({
        model: createOpenAIChatModel(apiKey, baseUrl, validationModelId),
        messages: [
          {
            role: 'user',
            content: 'What is the capital of France? Respond with one word.',
          },
        ],
        abortSignal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Invalid MiniMax API key: ${
          err instanceof Error ? err.message : String(err)
        }`,
      };
    }
  },

  // ── Model ID transforms ────────────────────────────────────────────────

  toWireModelId(modelId: string): string {
    return toNativeMiniMaxModelId(modelId);
  },

  // ── Model creation ─────────────────────────────────────────────────────

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

    // ── Discovery ──────────────────────────────────────────────────────────

    async getInitialModels(
      config: OfficialApiConfig,
      decryptedConfig: Record<string, string>,
    ): Promise<DiscoveredModel[]> {
      const baseUrl = config.baseUrl ?? meta.defaultBaseUrl;
      if (!baseUrl) return [];
      const apiKey = decryptedConfig.encryptedApiKey ?? '';
      return discoverOpenAICompatibleModels(baseUrl, apiKey, vendor);
    },

    async refreshModels(
      config: OfficialApiConfig,
      decryptedConfig: Record<string, string>,
    ): Promise<DiscoveredModel[]> {
      const baseUrl = config.baseUrl ?? meta.defaultBaseUrl;
      if (!baseUrl) return [];
      const apiKey = decryptedConfig.encryptedApiKey ?? '';
      return discoverOpenAICompatibleModels(baseUrl, apiKey, vendor);
    },

    // ── Validation ─────────────────────────────────────────────────────────

    async validateCredentials(
      _config: OfficialApiConfig,
      decryptedConfig: Record<string, string>,
    ): Promise<{ success: true } | { success: false; error: string }> {
      const apiKey = decryptedConfig.encryptedApiKey ?? '';
      const baseUrl = _config.baseUrl ?? meta.defaultBaseUrl;
      if (!baseUrl) {
        return {
          success: false,
          error: `No base URL configured for ${vendor} API`,
        };
      }
      const validationModelId = VENDOR_VALIDATION_MODEL[vendor];
      if (!validationModelId) {
        // Should not happen for factory-created types, but guard anyway
        return {
          success: false,
          error: `No validation model configured for ${vendor} API`,
        };
      }
      try {
        await generateText({
          model: createOpenAIChatModel(apiKey, baseUrl, validationModelId),
          messages: [
            {
              role: 'user',
              content: 'What is the capital of France? Respond with one word.',
            },
          ],
        });
        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: `Invalid ${vendor} API key: ${
            err instanceof Error ? err.message : String(err)
          }`,
        };
      }
    },

    // ── Model creation ─────────────────────────────────────────────────────

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
