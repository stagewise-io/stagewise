import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { CodingPlan } from '@shared/coding-plans';
import { generateText, type ModelMessage } from 'ai';

export type ApiKeyProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'moonshotai'
  | 'alibaba'
  | 'deepseek'
  | 'z-ai'
  | 'minimax'
  | 'xiaomi-mimo'
  | 'mistral';

export type ApiKeyValidationResult =
  | null
  | { success: true }
  | { success: false; error: string };

export type ApiKeyValidationResults = Record<
  ApiKeyProvider,
  ApiKeyValidationResult
>;

export type ApiKeysInput = Partial<Record<ApiKeyProvider, string>>;

type ValidationModel = Parameters<typeof generateText>[0]['model'];

const validationMessages: ModelMessage[] = [
  {
    role: 'user',
    content: 'What is the capital of France? Respond with one word.',
  },
];

const providerConfigs: Record<
  ApiKeyProvider,
  (apiKey: string, baseURL?: string) => ValidationModel
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
  'xiaomi-mimo': (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.xiaomimimo.com/v1',
    }).chat('mimo-v2.5'),
  mistral: (apiKey, baseURL) =>
    createOpenAI({
      apiKey,
      baseURL: baseURL ?? 'https://api.mistral.ai/v1',
    }).chat('mistral-small-latest'),
};

async function validateModel(model: ValidationModel): Promise<void> {
  await generateText({
    model,
    messages: validationMessages,
  });
}

export async function validateCodingPlanApiKey(
  plan: CodingPlan,
  apiKey: string,
): Promise<ApiKeyValidationResult> {
  const validationBaseURL = plan.validationBaseUrl ?? plan.baseUrl;

  if (validationBaseURL && plan.validationModelId) {
    try {
      await validateModel(
        createOpenAI({
          apiKey,
          baseURL: validationBaseURL,
        }).chat(plan.validationModelId),
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: `Invalid ${plan.displayName} key: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const results = await validateApiKeys({ [plan.provider]: apiKey });
  const result = results[plan.provider];
  return result ?? { success: false, error: 'Validation was skipped' };
}

async function validateMiniMaxApiKey(
  apiKey: string,
  baseURL?: string,
): Promise<ApiKeyValidationResult> {
  const provider = createOpenAI({
    apiKey,
    baseURL: baseURL ?? 'https://api.minimax.io/v1',
  });
  const models = [provider.chat('minimax-m2.7'), provider.chat('MiniMax-M3')];
  const errors: string[] = [];

  for (const model of models) {
    try {
      await validateModel(model);
      return { success: true };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return {
    success: false,
    error: `Invalid minimax provider key: ${errors.join(' | ')}`,
  };
}

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
    'xiaomi-mimo': null,
    mistral: null,
  };

  const promises: Promise<void>[] = [];

  for (const [provider, apiKey] of Object.entries(keys)) {
    if (!apiKey) continue;
    const k = provider as ApiKeyProvider;
    if (!providerConfigs[k]) continue;
    const p =
      k === 'minimax'
        ? validateMiniMaxApiKey(apiKey, baseUrl).then((result) => {
            results[k] = result;
          })
        : validateModel(providerConfigs[k](apiKey, baseUrl))
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
