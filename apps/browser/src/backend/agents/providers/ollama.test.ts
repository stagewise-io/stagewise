import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverOllamaModels, ollamaProviderType } from './ollama';

describe('ollamaProviderType.createLanguageModel', () => {
  it.each([
    ['http://localhost:11434', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/', 'http://localhost:11434/v1/chat/completions'],
    ['http://localhost:11434/v1', 'http://localhost:11434/v1/chat/completions'],
    [
      'http://localhost:11434/v1/',
      'http://localhost:11434/v1/chat/completions',
    ],
  ])('uses exactly one /v1 suffix for %s', (baseURL, expectedUrl) => {
    const { model } = ollamaProviderType.createLanguageModel({
      modelId: 'llama3',
      baseURL,
      apiKey: '',
      config: { baseUrl: baseURL },
      decryptedConfig: {},
    });

    expect(
      (
        model as unknown as {
          config: { url: (options: { path: string }) => URL };
        }
      ).config
        .url({ path: '/chat/completions' })
        .toString(),
    ).toBe(expectedUrl);
  });
});

describe('discoverOllamaModels', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('filters embedding-only models when metadata is available', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({
            models: [{ name: 'chat' }, { name: 'embedding' }],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/show')) {
        const { name } = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            capabilities: name === 'embedding' ? ['embedding'] : ['completion'],
          }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(
      discoverOllamaModels('http://localhost:11434'),
    ).resolves.toEqual([expect.objectContaining({ modelId: 'chat' })]);
  });

  it.each([
    'http://localhost:11434',
    'http://localhost:11434/',
    'http://localhost:11434/v1',
    'http://localhost:11434/v1/',
  ])('derives discovery routes from the Ollama root for %s', async (baseUrl) => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url === 'http://localhost:11434/api/tags') {
          return new Response(JSON.stringify({ models: [{ name: 'chat' }] }), {
            status: 200,
          });
        }
        if (url === 'http://localhost:11434/api/show') {
          return new Response(
            JSON.stringify({ capabilities: ['completion'] }),
            {
              status: 200,
            },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      });

    await expect(discoverOllamaModels(baseUrl)).resolves.toEqual([
      expect.objectContaining({ modelId: 'chat' }),
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:11434/api/tags',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:11434/api/show',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('keeps models selectable when metadata enrichment fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return new Response(
          JSON.stringify({ models: [{ name: 'one' }, { name: 'two' }] }),
          { status: 200 },
        );
      }
      throw new Error('metadata unavailable');
    });

    await expect(
      discoverOllamaModels('http://localhost:11434'),
    ).resolves.toEqual([
      expect.objectContaining({ modelId: 'one' }),
      expect.objectContaining({ modelId: 'two' }),
    ]);
  });

  it('clears the discovery deadline when tags JSON is malformed', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{', { status: 200 }),
    );

    await expect(
      discoverOllamaModels('http://localhost:11434'),
    ).rejects.toThrow(SyntaxError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retains all models when a shared discovery deadline aborts queued metadata', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.endsWith('/api/tags')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              models: Array.from({ length: 5 }, (_, index) => ({
                name: `model-${index}`,
              })),
            }),
            { status: 200 },
          ),
        );
      }
      return new Promise((_, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'));
          },
        );
      });
    });

    const discovery = discoverOllamaModels('http://localhost:11434');
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(discovery).resolves.toHaveLength(5);
  });
});
