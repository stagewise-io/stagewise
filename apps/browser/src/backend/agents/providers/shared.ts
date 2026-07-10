import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ModelProvider } from '@shared/karton-contracts/ui/shared-types';

// ============================================================================
// Model ID transforms
// ============================================================================

/**
 * Converts an OpenRouter-style Anthropic model ID (dots in version, e.g.
 * `claude-opus-4.8`) to the native Anthropic API format (hyphens, e.g.
 * `claude-opus-4-8`). Idempotent on IDs that already use hyphens.
 */
export function toNativeAnthropicModelId(modelId: string): string {
  return modelId.replace(/\./g, '-');
}

export function toNativeMiniMaxModelId(modelId: string): string {
  if (modelId === 'minimax-m3') return 'MiniMax-M3';
  return modelId;
}

// ============================================================================
// OpenRouter provider prefix mapping (stagewise gateway)
// ============================================================================

/**
 * OpenRouter uses different provider prefixes for some vendors.
 * Used by the stagewise type to build the prefixed model ID.
 */
export const OPENROUTER_PROVIDER_MAP: Partial<Record<ModelProvider, string>> = {
  alibaba: 'qwen',
  'xiaomi-mimo': 'xiaomi',
  mistral: 'mistralai',
};

// ============================================================================
// Stagewise URL passthrough middleware
// ============================================================================

/**
 * Middleware that tells the SDK all HTTP(S) URLs are natively supported by the
 * stagewise gateway. Without this the SDK downloads every image/file URL and
 * inlines the content as base64, causing "payload too large" errors.
 */
export const stagewiseUrlPassthroughMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  overrideSupportedUrls: () => ({
    '*': [/^https?:\/\//i],
  }),
};

// ============================================================================
// Shared model-creation helpers
// ============================================================================
// Used by both official-api and custom-compatible provider types so that
// the AI-SDK provider instantiation logic lives in exactly one place.
// ============================================================================

export function createAnthropicModel(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
): LanguageModelV3 {
  const p = createAnthropic({ apiKey, baseURL });
  return p(toNativeAnthropicModelId(modelId) as never);
}

export function createOpenAIChatModel(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
): LanguageModelV3 {
  const p = createOpenAI({ apiKey, baseURL });
  return p.chat(modelId as never);
}

export function createOpenAIResponsesModel(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
): LanguageModelV3 {
  const p = createOpenAI({ apiKey, baseURL });
  return p.responses(modelId as never);
}

export function createGoogleModel(
  apiKey: string,
  baseURL: string | undefined,
  modelId: string,
): LanguageModelV3 {
  const p = createGoogleGenerativeAI({ apiKey, baseURL });
  return p(modelId as never);
}
