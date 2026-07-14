import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModelCapabilities } from '@stagewise/agent-core/types';
import type {
  ApiSpec,
  DiscoveredModel,
} from '@shared/karton-contracts/ui/shared-types';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import type { ProviderType } from './types';
import { createOpenAIChatModel } from './shared';

// ============================================================================
// Ollama config — just a base URL, no auth needed
// ============================================================================

export type OllamaConfig = {
  baseUrl: string;
};

// ============================================================================
// Capability inference from Ollama model names
// ============================================================================

const VISION_SUFFIXES = /llava|bakllava|llama.*vision|minicpm-v/i;

function inferCapabilities(modelName: string): ModelCapabilities {
  const hasVision = VISION_SUFFIXES.test(modelName);

  return {
    inputModalities: {
      text: true,
      audio: false,
      image: hasVision,
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
    toolCalling: false,
  };
}

// ============================================================================
// Ollama provider type — self-hosted, discovery via /api/tags
// ============================================================================

export const ollamaProviderType: ProviderType<OllamaConfig> = {
  id: 'ollama',
  ...PROVIDER_TYPE_DISPLAY_INFO.ollama,
  category: 'self-hosted',
  providerMode: 'custom',
  apiSpec: 'openai-chat-completions' satisfies ApiSpec,
  sensitiveFields: [],

  defaultBaseUrl: PROVIDER_TYPE_DISPLAY_INFO.ollama.defaultBaseUrl,

  // ── Discovery ──────────────────────────────────────────────────────────

  async getInitialModels(config: OllamaConfig): Promise<DiscoveredModel[]> {
    return discoverOllamaModels(config.baseUrl);
  },

  async refreshModels(config: OllamaConfig): Promise<DiscoveredModel[]> {
    return discoverOllamaModels(config.baseUrl);
  },

  // ── Model creation ────────────────────────────────────────────────────

  createLanguageModel({ modelId, baseURL }) {
    // Ollama's OpenAI-compatible endpoint is at /v1, but the AI-SDK OpenAI
    // provider appends /chat/completions directly to baseURL. Prepend /v1.
    const v1BaseURL = baseURL
      ? `${baseURL.replace(/\/$/, '')}/v1`
      : `${(PROVIDER_TYPE_DISPLAY_INFO.ollama.defaultBaseUrl ?? 'http://localhost:11434').replace(/\/$/, '')}/v1`;
    const model = createOpenAIChatModel(
      'ollama',
      v1BaseURL,
      modelId,
    ) as LanguageModelV3;
    return { model };
  },
};

// ============================================================================
// Helpers
// ============================================================================

const DISCOVERY_TIMEOUT_MS = 10_000;
const METADATA_CONCURRENCY = 4;

type OllamaModelMetadata = {
  capabilities?: string[];
};

async function getOllamaModelMetadata(
  endpoint: string,
  name: string,
): Promise<OllamaModelMetadata | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const response = await fetch(`${endpoint}/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    return (await response.json()) as OllamaModelMetadata;
  } catch {
    // The tags response is still useful when an older server does not expose
    // capabilities. Unknown models remain selectable rather than hidden.
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function isEmbeddingOnly(metadata: OllamaModelMetadata | undefined): boolean {
  const capabilities = metadata?.capabilities;
  return (
    !!capabilities?.includes('embedding') &&
    !capabilities.includes('completion')
  );
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex++;
        results[index] = await mapper(values[index]!);
      }
    }),
  );
  return results;
}

export async function discoverOllamaModels(
  baseUrl: string,
): Promise<DiscoveredModel[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/tags`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        `Ollama discovery timed out after ${DISCOVERY_TIMEOUT_MS / 1000}s at ${url}`,
      );
    }
    throw err;
  }
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Ollama /api/tags returned ${response.status}`);
  }
  const data = (await response.json()) as {
    models?: { name: string; modified_at?: string; size?: number }[];
  };
  const models = data.models ?? [];
  const endpoint = `${baseUrl.replace(/\/$/, '')}/api`;
  const metadata = await mapWithConcurrency(
    models,
    METADATA_CONCURRENCY,
    (model) => getOllamaModelMetadata(endpoint, model.name),
  );

  return models.flatMap((model, index) =>
    isEmbeddingOnly(metadata[index])
      ? []
      : [
          {
            modelId: model.name,
            displayName: model.name,
            capabilities: inferCapabilities(model.name),
          },
        ],
  );
}
