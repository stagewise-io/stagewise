import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export type ApiKeyProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'moonshotai'
  | 'alibaba'
  | 'deepseek'
  | 'z-ai'
  | 'minimax';

export type ApiKeyValidationResult =
  | null
  | { success: true }
  | { success: false; error: string };

export type ApiKeyValidationResults = Record<
  ApiKeyProvider,
  ApiKeyValidationResult
>;

export type ApiKeysInput = Partial<Record<ApiKeyProvider, string>>;

const providerConfigs: Record<
  ApiKeyProvider,
  (
    apiKey: string,
    baseURL?: string,
  ) => Parameters<typeof generateText>[0]['model']
> = {
  anthropic: (apiKey, baseURL) =>
    createAnthropic({ apiKey, baseURL })('claude-haiku-4-5'),
  openai: (apiKey, baseURL) => createOpenAI({ apiKey, baseURL })('gpt-5-nano'),
  google: (apiKey, baseURL) =>
    createGoogleGenerativeAI({ apiKey, baseURL })('gemini-2.5-flash-lite'),
  // OpenAI-compatible providers below must use `.chat(...)` rather than the
  // default `(id)` shorthand: `createOpenAI()(id)` targets the Responses API
  // (only OpenAI itself implements it), whereas these upstreams speak Chat
  // Completions. Without `.chat(...)`, the probe hits a non-existent endpoint
  // and valid keys get rejected.
  moonshotai: (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.moonshot.ai/v1',
    }).chat('kimi-k2.6'),
  alibaba: (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL:
        baseURL ?? 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    }).chat('qwen-turbo'),
  deepseek: (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.deepseek.com/v1',
    }).chat('deepseek-v4-flash'),
  'z-ai': (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.z.ai/api/paas/v4',
    }).chat('glm-4.5-flash'),
  minimax: (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.minimax.io/v1',
    }).chat('minimax-m2.7'),
};

/**
 * Validate API keys by making a lightweight test request to each provider.
 * Keys that are empty/undefined are skipped (result stays `null`).
 *
 * Cloud providers (Azure, Bedrock, Vertex) are not validated here since they
 * require different auth mechanisms — validation for those happens at first use.
 */
export async function validateApiKeys(
  keys: ApiKeysInput,
  baseUrl?: string,
): Promise<ApiKeyValidationResults> {
  const results: ApiKeyValidationResults = {
    anthropic: null,
    openai: null,
    google: null,
    moonshotai: null,
    alibaba: null,
    deepseek: null,
    'z-ai': null,
    minimax: null,
  };

  const promises: Promise<void>[] = [];

  for (const [provider, apiKey] of Object.entries(keys)) {
    if (!apiKey) continue;
    const k = provider as ApiKeyProvider;
    if (!providerConfigs[k]) continue;
    const model = providerConfigs[k](apiKey, baseUrl);

    const p = generateText({
      model,
      messages: [
        {
          role: 'user',
          content: 'What is the capital of France? Respond with one word.',
        },
      ],
    })
      .then(() => {
        results[k] = { success: true };
      })
      .catch((err) => {
        results[k] = {
          success: false,
          error: `Invalid ${k} provider key: ${err instanceof Error ? err.message : String(err)}`,
        };
      });

    promises.push(p);
  }

  await Promise.all(promises);
  return results;
}
