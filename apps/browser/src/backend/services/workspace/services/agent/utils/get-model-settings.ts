import type { LanguageModelV3 } from '@ai-sdk/provider';
import { availableModels } from '@shared/available-models';
import type { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';

type ProviderOptions = Parameters<typeof streamText>[0]['providerOptions'];
type ModelId = (typeof availableModels)[number]['modelId'];

/**
 * Get model options for the agent using native AI SDK providers with LiteLLM passthroughs.
 *
 * Each provider uses its native format with the appropriate LiteLLM passthrough endpoint:
 * - Anthropic models: @ai-sdk/anthropic → /anthropic/v1 passthrough
 * - OpenAI models: @ai-sdk/openai → /openai/v1 passthrough
 * - Google models: @ai-sdk/google → /gemini/v1beta passthrough
 *
 * This avoids any format translation in LiteLLM, ensuring maximum compatibility.
 */
export function getModelOptions(
  modelId: ModelId,
  accessToken: string,
): {
  model: LanguageModelV3;
  providerOptions: ProviderOptions;
  headers: Record<string, string>;
} {
  const baseUrl = process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';
  const modelSettings = availableModels.find((m) => m.modelId === modelId);
  if (!modelSettings) throw new Error(`Model ${modelId} not found`);

  const headers = modelSettings.headers;

  switch (modelSettings.modelId) {
    // Anthropic models - use Anthropic passthrough
    case 'claude-opus-4-5':
    case 'claude-sonnet-4-5':
    case 'claude-haiku-4-5': {
      const anthropicProvider = createAnthropic({
        apiKey: accessToken,
        baseURL: `${baseUrl}/anthropic/v1`,
      });
      return {
        model: anthropicProvider(modelSettings.modelId),
        headers,
        providerOptions: { anthropic: { ...modelSettings.providerOptions } },
      };
    }

    // OpenAI models - use OpenAI passthrough
    case 'gpt-5.2':
    case 'gpt-5.1-codex-max': {
      const openaiProvider = createOpenAI({
        apiKey: accessToken,
        baseURL: `${baseUrl}/openai/v1`,
      });
      return {
        model: openaiProvider(modelSettings.modelId),
        headers,
        providerOptions: { openai: { ...modelSettings.providerOptions } },
      };
    }

    // Google models - use Gemini passthrough
    case 'gemini-3-pro-preview': {
      const googleProvider = createGoogleGenerativeAI({
        apiKey: accessToken,
        baseURL: `${baseUrl}/gemini/v1beta`,
      });
      return {
        model: googleProvider(modelSettings.modelId),
        headers,
        providerOptions: { google: { ...modelSettings.providerOptions } },
      };
    }

    default: {
      // Fallback to first model (Anthropic) with passthrough
      const fallbackModel = availableModels[0];
      const anthropicProvider = createAnthropic({
        apiKey: accessToken,
        baseURL: `${baseUrl}/anthropic/v1`,
      });
      return {
        model: anthropicProvider(fallbackModel.modelId),
        headers: fallbackModel.headers,
        providerOptions: { anthropic: { ...fallbackModel.providerOptions } },
      };
    }
  }
}

/**
 * Get an arbitrary model using OpenAI-compatible endpoint (standard LiteLLM abstraction).
 *
 * This uses the standard LiteLLM /v1 endpoint which provides OpenAI-compatible format
 * with full cost tracking support. Used for auxiliary tasks like chat title generation,
 * summarization, etc.
 */
export function getArbitraryModel(
  modelId: string,
  accessToken: string,
): LanguageModelV3 {
  const baseUrl = process.env.LLM_PROXY_URL || 'https://llm.stagewise.io';

  // Use OpenAI provider with standard LiteLLM endpoint for all arbitrary models
  // This provides cost tracking and works with any model LiteLLM supports
  const openaiProvider = createOpenAI({
    apiKey: accessToken,
    baseURL: `${baseUrl}/v1`,
  });

  return openaiProvider(modelId);
}
