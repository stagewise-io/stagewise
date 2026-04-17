import { createHash, createHmac } from 'node:crypto';
import type { JSONObject, SharedV3ProviderMetadata } from '@ai-sdk/provider';
import {
  createOpenAICompatible,
  type MetadataExtractor,
  type OpenAICompatibleProvider,
} from '@ai-sdk/openai-compatible';
import { deepMergeProviderOptions } from './model-provider';

declare const __APP_VERSION__: string;

/**
 * Creates a fetch wrapper that signs every outgoing request with an
 * HMAC-SHA256 signature so the API server can verify it originated
 * from a real stagewise client.
 */
function createSigningFetch(apiKey: string): typeof globalThis.fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? new URL(input)
        : new URL((input as Request).url);
    const method = init?.method ?? 'POST';
    const body = (init?.body as string) ?? '';

    const bodyHash = createHash('sha256').update(body).digest('hex');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signingData = `${timestamp}\n${method}\n${url.pathname}\n${bodyHash}`;
    const signature = createHmac('sha256', apiKey)
      .update(signingData)
      .digest('hex');

    const headers = new Headers(init?.headers);
    headers.set('X-Stagewise-Client', `electron/${__APP_VERSION__}`);
    headers.set('X-Stagewise-Ts', timestamp);
    headers.set('X-Stagewise-Sig', signature);

    return globalThis.fetch(input, { ...init, headers });
  };
}

/**
 * Metadata extractor that captures the full response body as provider
 * metadata, preserving all keys from the API response as-is.
 */
const stagewiseMetadataExtractor: MetadataExtractor = {
  extractMetadata: async ({ parsedBody }) => {
    const body = parsedBody as Record<string, unknown> | undefined;
    const choices = body?.choices as unknown[] | undefined;
    const message = (choices?.[0] as Record<string, unknown>)?.message as
      | Record<string, unknown>
      | undefined;
    const providerMetadata = message?.provider_metadata as
      | SharedV3ProviderMetadata
      | undefined;
    return providerMetadata;
  },
  createStreamExtractor: () => {
    const accumulated: SharedV3ProviderMetadata = {};
    return {
      processChunk(parsedChunk: unknown) {
        const chunk = parsedChunk as Record<string, unknown> | undefined;
        const choices = chunk?.choices as unknown[] | undefined;
        const delta = (choices?.[0] as Record<string, unknown>)?.delta as
          | Record<string, unknown>
          | undefined;
        const chunkProviderMetadata = delta?.provider_metadata as
          | SharedV3ProviderMetadata
          | undefined;

        if (!chunkProviderMetadata) return;

        for (const [key, value] of Object.entries(chunkProviderMetadata)) {
          const currentValue = accumulated[key];
          if (
            value != null &&
            typeof value === 'object' &&
            typeof currentValue === 'object'
          ) {
            accumulated[key] = deepMergeProviderOptions(
              currentValue as JSONObject,
              value as JSONObject,
            ) as JSONObject;
          } else if (value != null) {
            accumulated[key] = value;
          } else if (value == null) {
            delete accumulated[key];
          }
        }
      },
      buildMetadata: () => accumulated,
    };
  },
};

export type StagewiseProviderSettings = {
  apiKey: string;
  baseURL: string;
};

/**
 * Create a stagewise gateway provider that uses OpenAI-compatible
 * chat completions endpoints.
 *
 * Provider options are forwarded under the `stagewise` key and
 * response metadata is extracted under the same key.
 *
 * Message-level metadata (e.g. `cache_control`) is forwarded via the
 * built-in `openaiCompatible` providerOptions key which the SDK
 * spreads directly onto each message in the request body.
 */
export function createStagewise(
  settings: StagewiseProviderSettings,
): OpenAICompatibleProvider {
  return createOpenAICompatible({
    name: 'stagewise',
    apiKey: settings.apiKey,
    baseURL: settings.baseURL,
    fetch: createSigningFetch(settings.apiKey),
    metadataExtractor: stagewiseMetadataExtractor,
    includeUsage: true,
    supportsStructuredOutputs: true,
  });
}
