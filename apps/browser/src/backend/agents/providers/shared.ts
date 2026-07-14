import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type {
  DiscoveredModel,
  ModelCapabilities,
  ModelProvider,
} from '@shared/karton-contracts/ui/shared-types';

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
// OpenRouter provider prefix mapping (Stagewise Inference)
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
 * Stagewise Inference. Without this the SDK downloads every image/file URL and
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

// ============================================================================
// Shared model-discovery helpers
// ============================================================================
// Used by OpenAI-compatible provider types to fetch the model list from
// the standard `GET /v1/models` endpoint.
// ============================================================================

const DISCOVERY_TIMEOUT_MS = 10_000;

/**
 * Per-vendor explicit list of reasoning/thinking-capable model IDs.
 *
 * Used during discovery to flag discovered models with
 * `thinkingEnabled: true`. Catalog models are already handled by the
 * catalog-wins deduplication in `getSelectableModelEntries`, so they appear
 * with their catalog `thinkingEnabled` value — but listing them here too
 * acts as a safety net in case dedup is bypassed.
 *
 * Matching is case-insensitive (all IDs stored lowercase). Update this list
 * when a vendor releases a new reasoning model that isn't in the static
 * catalog.
 */
const VENDOR_REASONING_MODEL_IDS: Partial<Record<ModelProvider, Set<string>>> =
  {
    openai: new Set([
      // Catalog reasoning models (safety net for catalog-wins dedup)
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-codex',
      'gpt-5.3-chat',
      // Non-catalog reasoning models returned by /v1/models
      // (gpt-5.6 alias routes to Sol; o-series are reasoning-only)
      'gpt-5.6',
      'gpt-5.5-pro',
      'o3',
      'o3-mini',
      'o4-mini',
      'o1',
      'o1-mini',
      'o1-pro',
    ]),
    google: new Set([
      // Catalog reasoning models (safety net for catalog-wins dedup)
      'gemini-3.1-pro-preview',
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
    ]),
    'z-ai': new Set([
      'glm-4.5',
      'glm-4.5-air',
      'glm-4.5v',
      'glm-4.6',
      'glm-4.7',
      'glm-5',
      'glm-5.1',
      'glm-5.2',
      'glm-5v-turbo',
    ]),
    deepseek: new Set([
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-reasoner',
    ]),
    moonshotai: new Set([
      'kimi-k2.5',
      'kimi-k2.6',
      'kimi-k2.7-code',
      'kimi-thinking-preview',
    ]),
    alibaba: new Set([
      'qwen3-32b',
      'qwen3-coder-30b-a3b-instruct',
      'qwq-32b',
      'qwen3-coder-plus',
      'qwen3-235b-a22b-thinking',
    ]),
    minimax: new Set([
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2',
      'minimax-m1',
    ]),
    'xiaomi-mimo': new Set(['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2.5-think']),
    mistral: new Set([
      'mistral-medium-3-5',
      'mistral-small-2603',
      'magistral-medium-latest',
      'magistral-small-latest',
    ]),
  };

/**
 * Conservative default capabilities for discovered models when the API
 * does not report capability details. Assumes text in/out with tool
 * calling support, no vision/audio.
 */
const DEFAULT_DISCOVERED_CAPABILITIES = {
  inputModalities: {
    text: true,
    audio: false,
    image: false,
    video: false,
    file: false,
  },
  outputModalities: {
    text: true,
    audio: false,
    image: false,
    video: false,
    file: false,
  },
  toolCalling: true,
} as const;

/**
 * Discover models from any OpenAI-compatible `/v1/models` endpoint.
 *
 * Makes an authenticated `GET {baseUrl}/models` request with a 10-second
 * timeout and maps the standard `{ data: { id: string }[] }` response to
 * `DiscoveredModel[]`.
 */
/** Discover models from Anthropic's paginated `/v1/models` API. */
export async function discoverAnthropicModels(
  baseUrl: string,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Model discovery at ${url} returned ${response.status}`);
    }
    const data = (await response.json()) as {
      data?: { id: string; display_name?: string }[];
    };
    return (data.data ?? []).map((model) => ({
      modelId: model.id,
      displayName: model.display_name ?? model.id,
      capabilities: DEFAULT_DISCOVERED_CAPABILITIES,
    }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Model discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s at ${url}`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function discoverOpenAICompatibleModels(
  baseUrl: string,
  apiKey: string,
  vendor?: ModelProvider,
): Promise<DiscoveredModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Model discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s at ${url}`,
      );
    }
    throw err;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Model discovery at ${url} returned ${response.status}`);
  }
  const data = (await response.json()) as {
    data?: { id: string }[];
  };
  const models = data.data ?? [];
  const reasoningIds = vendor ? VENDOR_REASONING_MODEL_IDS[vendor] : undefined;
  return models
    .filter((m) => {
      // Filter out non-chat/reasoning model types that OpenAI's /v1/models
      // endpoint returns (embeddings, TTS, whisper, realtime, moderation,
      // dall-e). These can't be used with chat completions or responses.
      return !/\b(embedding|tts|whisper|realtime|moderation|dall-e)\b/i.test(
        m.id,
      );
    })
    .map((m) => {
      const thinkingEnabled = reasoningIds?.has(m.id.toLowerCase()) ?? false;
      return {
        modelId: m.id,
        displayName: m.id,
        capabilities: DEFAULT_DISCOVERED_CAPABILITIES,
        ...(thinkingEnabled ? { thinkingEnabled: true } : {}),
      };
    });
}

/**
 * Discover models from the Google Generative AI API.
 *
 * Google's API differs from OpenAI-compatible endpoints:
 * - Auth via `?key=` query parameter (not Bearer header)
 * - Response shape: `{ models: [{ name: "models/gemini-2.0-flash", ... }] }`
 * - Model names have a `models/` prefix that must be stripped
 * - `supportedGenerationMethods` filters out embedding-only models
 * - `inputTokenLimit` provides context window info
 */
export async function discoverGoogleModels(
  baseUrl: string,
  apiKey: string,
): Promise<DiscoveredModel[]> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/models`;
  type GoogleModelsPage = {
    models?: {
      name: string;
      displayName?: string;
      inputTokenLimit?: number;
      supportedGenerationMethods?: string[];
    }[];
    nextPageToken?: string;
  };
  const models: NonNullable<GoogleModelsPage['models']> = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ key: apiKey });
    if (pageToken) params.set('pageToken', pageToken);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${endpoint}?${params.toString()}`, {
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new Error(
          `Model discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s at ${endpoint}`,
        );
      }
      throw err;
    }
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error(
        `Model discovery at ${endpoint} returned ${response.status}`,
      );
    }
    const page = (await response.json()) as GoogleModelsPage;
    models.push(
      ...(page.models ?? []).filter((model) =>
        model.supportedGenerationMethods?.includes('generateContent'),
      ),
    );
    pageToken = page.nextPageToken;
  } while (pageToken);
  const reasoningIds = VENDOR_REASONING_MODEL_IDS.google;
  return models.map((m) => {
    const modelId = m.name.replace(/^models\//, '');
    const thinkingEnabled = reasoningIds?.has(modelId.toLowerCase()) ?? false;
    return {
      modelId,
      displayName: m.displayName ?? modelId,
      capabilities: DEFAULT_DISCOVERED_CAPABILITIES,
      ...(m.inputTokenLimit ? { contextWindow: m.inputTokenLimit } : {}),
      ...(thinkingEnabled ? { thinkingEnabled: true } : {}),
    };
  });
}

// ============================================================================
// OpenRouter model discovery
// ============================================================================

/**
 * Shape of a single model entry in the OpenRouter `/v1/models` response.
 * Only the fields we consume are typed; the full response includes more.
 */
type OpenRouterModelEntry = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
};

/**
 * Map an OpenRouter modality string to the internal capability field name.
 */
function mapOpenRouterModality(modality: string): string | undefined {
  switch (modality) {
    case 'text':
      return 'text';
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'file':
      return 'file';
    default:
      return undefined;
  }
}

/**
 * Build a `ModelCapabilities` object from OpenRouter architecture fields.
 * Falls back to the default capabilities when architecture data is missing.
 */
function mapOpenRouterCapabilities(
  entry: OpenRouterModelEntry,
): ModelCapabilities | undefined {
  const { input_modalities, output_modalities } = entry.architecture ?? {};
  if (!input_modalities && !output_modalities) return undefined;

  const input: ModelCapabilities['inputModalities'] = {
    text: false,
    audio: false,
    image: false,
    video: false,
    file: false,
  };
  const output: ModelCapabilities['outputModalities'] = {
    text: false,
    audio: false,
    image: false,
    video: false,
    file: false,
  };

  for (const m of input_modalities ?? []) {
    const key = mapOpenRouterModality(m);
    if (key) (input as Record<string, boolean>)[key] = true;
  }
  // OpenRouter rarely lists 'text' explicitly in input_modalities but
  // all chat models accept text.
  input.text = true;

  for (const m of output_modalities ?? []) {
    const key = mapOpenRouterModality(m);
    if (key) (output as Record<string, boolean>)[key] = true;
  }
  // Output text is implied for chat models.
  output.text = true;

  return {
    inputModalities: input,
    outputModalities: output,
    toolCalling: entry.supported_parameters?.includes('tools') ?? true,
  };
}

/**
 * Discover models from the OpenRouter API.
 *
 * OpenRouter's public `GET /v1/models` endpoint returns rich metadata
 * including explicit `supported_parameters` (with `'reasoning'` for
 * reasoning-capable models), per-token pricing, context length, and
 * input/output modalities — eliminating the need for heuristic-based
 * reasoning detection.
 *
 * Tilde-prefixed meta-models (e.g. `~anthropic/claude-haiku-latest`) and
 * `openrouter/`-prefixed router models (e.g. `openrouter/auto`) are
 * included but marked `recommended: false` so users must explicitly opt in.
 *
 * The `apiKey` is optional for listing but helps with rate limits.
 */
export async function discoverOpenRouterModels(
  apiKey: string,
  baseUrl = 'https://openrouter.ai/api/v1',
): Promise<DiscoveredModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Model discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s at ${url}`,
      );
    }
    throw err;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Model discovery at ${url} returned ${response.status}`);
  }

  const data = (await response.json()) as {
    data?: OpenRouterModelEntry[];
  };
  const models = data.data ?? [];

  return models.map((m) => {
    const isMetaModel = m.id.startsWith('~') || m.id.startsWith('openrouter/');

    const thinkingEnabled =
      m.supported_parameters?.includes('reasoning') ?? false;

    const capabilities = mapOpenRouterCapabilities(m);

    // Convert per-token pricing to per-million. OpenRouter returns
    // prices as decimal strings (e.g. "0.000001" = $0.000001/token).
    let pricing: DiscoveredModel['pricing'];
    const promptStr = m.pricing?.prompt;
    const completionStr = m.pricing?.completion;
    if (promptStr && completionStr) {
      const promptPerToken = Number.parseFloat(promptStr);
      const completionPerToken = Number.parseFloat(completionStr);
      if (
        Number.isFinite(promptPerToken) &&
        Number.isFinite(completionPerToken) &&
        promptPerToken > 0 &&
        completionPerToken > 0
      ) {
        pricing = {
          inputPerMillion: promptPerToken * 1_000_000,
          outputPerMillion: completionPerToken * 1_000_000,
        };
      }
    }

    return {
      modelId: m.id,
      displayName: m.name ?? m.id,
      ...(m.context_length && m.context_length > 0
        ? { contextWindow: m.context_length }
        : {}),
      ...(capabilities ? { capabilities } : {}),
      ...(thinkingEnabled ? { thinkingEnabled: true } : {}),
      ...(isMetaModel ? { recommended: false } : {}),
      ...(pricing ? { pricing } : {}),
    };
  });
}
