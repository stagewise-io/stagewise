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

const EMBED_SUFFIXES = /^all-minilm|^nomic-embed|^bge-|embed/;
const VISION_SUFFIXES = /llava|bakllava|llama.*vision|minicpm-v/i;

function inferCapabilities(modelName: string): ModelCapabilities {
  const isEmbedding = EMBED_SUFFIXES.test(modelName);
  const hasVision = !isEmbedding && VISION_SUFFIXES.test(modelName);

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
      : 'http://localhost:11434/v1';
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

async function discoverOllamaModels(
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
  return models.map((m) => ({
    modelId: m.name,
    displayName: m.name,
    capabilities: inferCapabilities(m.name),
  }));
}
