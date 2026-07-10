import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ApiSpec } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import {
  toNativeAnthropicModelId,
  createAnthropicModel,
  createOpenAIChatModel,
  createOpenAIResponsesModel,
  createGoogleModel,
} from './shared';

// ============================================================================
// Custom-compatible config — encrypted key + base URL + optional ID mapping
// ============================================================================

export type CustomCompatibleConfig = {
  encryptedApiKey?: string;
  baseUrl: string;
  modelIdMapping?: Record<string, string>;
};

// ============================================================================
// Custom Anthropic
// ============================================================================

export const customAnthropicType: ProviderType<CustomCompatibleConfig> = {
  id: 'custom-anthropic',
  displayName: 'Custom Anthropic',
  description: 'Anthropic-compatible custom endpoint',
  category: 'custom-compatible',
  providerMode: 'custom',
  apiSpec: 'anthropic' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  toWireModelId(modelId: string): string {
    return toNativeAnthropicModelId(modelId);
  },

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return { model: createAnthropicModel(apiKey, baseURL, modelId) };
  },
};

// ============================================================================
// Custom OpenAI Chat Completions
// ============================================================================

export const customOpenAIChatType: ProviderType<CustomCompatibleConfig> = {
  id: 'custom-openai-chat',
  displayName: 'Custom OpenAI (Chat)',
  description: 'OpenAI Chat Completions-compatible custom endpoint',
  category: 'custom-compatible',
  providerMode: 'custom',
  apiSpec: 'openai-chat-completions' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return { model: createOpenAIChatModel(apiKey, baseURL, modelId) };
  },
};

// ============================================================================
// Custom OpenAI Responses
// ============================================================================

export const customOpenAIResponsesType: ProviderType<CustomCompatibleConfig> = {
  id: 'custom-openai-responses',
  displayName: 'Custom OpenAI (Responses)',
  description: 'OpenAI Responses API-compatible custom endpoint',
  category: 'custom-compatible',
  providerMode: 'custom',
  apiSpec: 'openai-responses' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return { model: createOpenAIResponsesModel(apiKey, baseURL, modelId) };
  },
};

// ============================================================================
// Custom Google
// ============================================================================

export const customGoogleType: ProviderType<CustomCompatibleConfig> = {
  id: 'custom-google',
  displayName: 'Custom Google',
  description: 'Google Generative AI-compatible custom endpoint',
  category: 'custom-compatible',
  providerMode: 'custom',
  apiSpec: 'google' satisfies ApiSpec,
  sensitiveFields: ['encryptedApiKey'],

  createLanguageModel({ modelId, apiKey, baseURL }): {
    model: LanguageModelV3;
  } {
    return { model: createGoogleModel(apiKey, baseURL, modelId) };
  },
};
