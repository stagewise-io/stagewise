import { describe, expect, it, vi } from 'vitest';
import { adapterForProviderType } from '../../acp/adapter-registry';
import { parseCodexChatGptAuth } from './chatgpt-auth';
import {
  collectCodexStream,
  createCodexChatGptFetch,
} from './stagewise-harness';

function token(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

describe('Codex with Stagewise agent', () => {
  it('reads ChatGPT auth without exposing it as provider config', () => {
    expect(
      parseCodexChatGptAuth({
        tokens: {
          access_token: token({
            'https://api.openai.com/auth': {
              chatgpt_account_id: 'account-from-token',
            },
          }),
          account_id: 'stored-account',
        },
      }),
    ).toEqual({
      accessToken: expect.any(String),
      accountId: 'stored-account',
    });
  });

  it('adds Codex authentication headers at request time', async () => {
    let receivedHeaders: HeadersInit | undefined;
    const fetchImplementation = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        receivedHeaders = init?.headers;
        return new Response('ok');
      },
    ) as typeof fetch;
    const codexFetch = createCodexChatGptFetch(
      async () => ({
        accessToken: 'secret-token',
        accountId: 'account-id',
      }),
      fetchImplementation,
    );

    await codexFetch('https://chatgpt.com/backend-api/codex/responses', {
      headers: { Accept: 'text/event-stream' },
    });

    const headers = new Headers(receivedHeaders);
    expect(headers.get('Authorization')).toBe('Bearer secret-token');
    expect(headers.get('ChatGPT-Account-ID')).toBe('account-id');
    expect(headers.get('originator')).toBe('codex_cli_rs');
    expect(headers.get('Accept')).toBe('text/event-stream');
  });

  it('stays on the Stagewise runtime instead of being claimed by ACP', () => {
    expect(adapterForProviderType('codex-stagewise')).toBeUndefined();
  });

  it('collects the streaming-only response for utility model calls', async () => {
    const usage = {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const result = await collectCodexStream({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'text' });
          controller.enqueue({
            type: 'text-delta',
            id: 'text',
            delta: 'OK',
          });
          controller.enqueue({ type: 'text-end', id: 'text' });
          controller.enqueue({
            type: 'finish',
            usage,
            finishReason: { unified: 'stop', raw: 'completed' },
          });
          controller.close();
        },
      }),
    });

    expect(result.content).toEqual([{ type: 'text', text: 'OK' }]);
    expect(result.usage).toEqual(usage);
  });
});
