import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { DiscoveredModel } from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import { generateText } from 'ai';
import { createOpenAIChatModel, discoverOpenRouterModels } from './shared';

const VALIDATION_TIMEOUT_MS = 10_000;

// ============================================================================
// OpenRouter config — encrypted key + optional base URL override
// (same shape as OfficialApiConfig, re-declared for clarity)
// ============================================================================

export type OpenRouterConfig = {
  encryptedApiKey?: string;
  baseUrl?: string;
};

// ============================================================================
// OpenRouter provider type
// ============================================================================
//
// OpenRouter is an OpenAI Chat Completions-compatible meta-provider that
// routes requests to 345+ models from all major vendors. Its public
// `/v1/models` endpoint returns rich metadata (reasoning support, tools,
// context length, per-token pricing, input modalities), so reasoning
// detection is explicit — no heuristic-based VENDOR_REASONING_MODEL_IDS
// map needed.
//
// Model IDs include the vendor prefix (e.g. `anthropic/claude-opus-4.8`)
// and are sent to the API verbatim. Tilde-prefixed meta-models and
// `openrouter/` router models are discovered but marked
// `recommended: false`.

export const openrouterProviderType: ProviderType<OpenRouterConfig> = {
  id: 'openrouter',
  ...PROVIDER_TYPE_DISPLAY_INFO.openrouter,
  category: 'official-api',
  providerMode: 'official',
  apiSpec: 'openai-chat-completions',
  sensitiveFields: ['encryptedApiKey'],

  // ── Discovery ──────────────────────────────────────────────────────────

  async getInitialModels(
    config: OpenRouterConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl =
      config.baseUrl?.trim() ||
      PROVIDER_TYPE_DISPLAY_INFO.openrouter.defaultBaseUrl;
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenRouterModels(apiKey, baseUrl);
  },

  async refreshModels(
    config: OpenRouterConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<DiscoveredModel[]> {
    const baseUrl =
      config.baseUrl?.trim() ||
      PROVIDER_TYPE_DISPLAY_INFO.openrouter.defaultBaseUrl;
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    return discoverOpenRouterModels(apiKey, baseUrl);
  },

  // ── Validation ─────────────────────────────────────────────────────────

  async validateCredentials(
    config: OpenRouterConfig,
    decryptedConfig: Record<string, string>,
  ): Promise<{ success: true } | { success: false; error: string }> {
    const apiKey = decryptedConfig.encryptedApiKey ?? '';
    if (!apiKey) {
      return { success: false, error: 'OpenRouter API key is required' };
    }
    const baseUrl =
      config.baseUrl?.trim() ||
      PROVIDER_TYPE_DISPLAY_INFO.openrouter.defaultBaseUrl;
    // Use a cheap, widely-available model for the validation probe.
    const validationModelId = 'openai/gpt-4o-mini';
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
        error: `Invalid OpenRouter API key: ${
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
