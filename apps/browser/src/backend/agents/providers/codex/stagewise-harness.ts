import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelMiddleware } from 'ai';
import { PROVIDER_TYPE_DISPLAY_INFO } from '@shared/karton-contracts/ui/shared-types';
import { getCodexChatGptAuth, type CodexChatGptAuth } from './chatgpt-auth';
import { discoverCodexModels } from './models';
import type { ProviderType } from '../types';

const CODEX_RESPONSES_BASE_URL = 'https://chatgpt.com/backend-api/codex';
type TextBlock = Extract<
  LanguageModelV3Content,
  { type: 'text' } | { type: 'reasoning' }
>;

export function createCodexChatGptFetch(
  loadAuth: () => Promise<CodexChatGptAuth> = getCodexChatGptAuth,
  fetchImplementation: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    const auth = await loadAuth();
    const headers = new Headers(input instanceof Request ? input.headers : {});
    new Headers(init?.headers).forEach((value, key) => {
      headers.set(key, value);
    });
    headers.set('Authorization', `Bearer ${auth.accessToken}`);
    headers.set('originator', 'codex_cli_rs');
    headers.set('User-Agent', 'codex_cli_rs/stagewise');
    if (auth.accountId) {
      headers.set('ChatGPT-Account-ID', auth.accountId);
    } else {
      headers.delete('ChatGPT-Account-ID');
    }
    return fetchImplementation(input, { ...init, headers });
  };
}

export async function collectCodexStream(
  result: LanguageModelV3StreamResult,
): Promise<LanguageModelV3GenerateResult> {
  const content: LanguageModelV3Content[] = [];
  const blocks = new Map<string, TextBlock>();
  let warnings: LanguageModelV3GenerateResult['warnings'] = [];
  let response: LanguageModelV3GenerateResult['response'];
  let finish:
    | Pick<
        LanguageModelV3GenerateResult,
        'finishReason' | 'usage' | 'providerMetadata'
      >
    | undefined;

  const textBlock = (
    id: string,
    type: 'text' | 'reasoning',
    providerMetadata?: LanguageModelV3Content['providerMetadata'],
  ) => {
    const existing = blocks.get(id);
    if (existing) return existing;
    const block = { type, text: '', providerMetadata } as TextBlock;
    blocks.set(id, block);
    content.push(block);
    return block;
  };

  for await (const part of result.stream) {
    switch (part.type) {
      case 'stream-start':
        warnings = part.warnings;
        break;
      case 'response-metadata':
        response = { ...part, headers: result.response?.headers };
        break;
      case 'text-start':
      case 'reasoning-start':
        textBlock(
          part.id,
          part.type === 'text-start' ? 'text' : 'reasoning',
          part.providerMetadata,
        );
        break;
      case 'text-delta':
      case 'reasoning-delta': {
        textBlock(
          part.id,
          part.type === 'text-delta' ? 'text' : 'reasoning',
          part.providerMetadata,
        ).text += part.delta;
        break;
      }
      case 'text-end':
      case 'reasoning-end': {
        if (part.providerMetadata) {
          textBlock(
            part.id,
            part.type === 'text-end' ? 'text' : 'reasoning',
          ).providerMetadata = part.providerMetadata;
        }
        break;
      }
      case 'file':
      case 'source':
      case 'tool-call':
      case 'tool-result':
      case 'tool-approval-request':
        content.push(part);
        break;
      case 'finish':
        finish = part;
        break;
      case 'error':
        throw part.error;
    }
  }

  if (!finish) throw new Error('Codex stream ended without a finish event.');
  return {
    content,
    finishReason: finish.finishReason,
    usage: finish.usage,
    providerMetadata: finish.providerMetadata,
    request: result.request,
    response,
    warnings,
  };
}

const codexRequestMiddleware: LanguageModelMiddleware = {
  specificationVersion: 'v3',
  transformParams: async ({ params }) => ({
    ...params,
    // The ChatGPT Codex endpoint controls its own output budget and rejects
    // the public Responses API field used by utility calls.
    maxOutputTokens: undefined,
    providerOptions: {
      ...params.providerOptions,
      openai: {
        ...(params.providerOptions?.openai ?? {}),
        store: false,
      },
    } as LanguageModelV3CallOptions['providerOptions'],
  }),
  wrapGenerate: async ({ doStream }) => collectCodexStream(await doStream()),
};

export const codexStagewiseProviderType: ProviderType = {
  id: 'codex-stagewise',
  ...PROVIDER_TYPE_DISPLAY_INFO['codex-stagewise'],
  category: 'official-api',
  vendor: 'openai',
  providerMode: 'official',
  apiSpec: 'openai-responses',
  sensitiveFields: [],

  getInitialModels: discoverCodexModels,

  createLanguageModel({ modelId }) {
    const openai = createOpenAI({
      apiKey: 'codex-chatgpt-oauth',
      baseURL: CODEX_RESPONSES_BASE_URL,
      fetch: createCodexChatGptFetch(),
    });
    return {
      model: openai.responses(modelId),
      middleware: [codexRequestMiddleware],
    };
  },
};
