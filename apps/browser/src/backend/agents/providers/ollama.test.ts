import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverOllamaModels } from './ollama';

describe('discoverOllamaModels', () => {
  afterEach(() => {
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
    vi.useRealTimers();
  });
});
