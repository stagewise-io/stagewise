import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverAnthropicModels, discoverOpenRouterModels } from './shared';

describe('discoverAnthropicModels', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aggregates every page and sends the previous last_id as after_id', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-first', display_name: 'First' }],
            has_more: true,
            last_id: 'claude-first',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-second' }],
            has_more: false,
          }),
          { status: 200 },
        ),
      );

    await expect(
      discoverAnthropicModels('https://api.anthropic.test/v1', 'test-key'),
    ).resolves.toEqual([
      expect.objectContaining({
        modelId: 'claude-first',
        displayName: 'First',
      }),
      expect.objectContaining({ modelId: 'claude-second' }),
    ]);

    expect(String(fetchSpy.mock.calls[1]?.[0])).toBe(
      'https://api.anthropic.test/v1/models?after_id=claude-first',
    );
  });

  it('keeps non-success status errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Forbidden', { status: 403 }),
    );

    await expect(
      discoverAnthropicModels('https://api.anthropic.test/v1', 'test-key'),
    ).rejects.toThrow('returned 403');
  });

  it('uses one deadline across the paginated sequence', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
      return new Promise((_, reject) => {
        (init?.signal as AbortSignal | undefined)?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'));
          },
        );
      });
    });

    const discovery = discoverAnthropicModels(
      'https://api.anthropic.test/v1',
      'test-key',
    );
    const expectation = expect(discovery).rejects.toThrow(
      'timed out after 10s',
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await expectation;
  });
});

describe('discoverOpenRouterModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses conservative defaults when architecture is absent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: 'vendor/tools-only', supported_parameters: ['tools'] },
            { id: 'vendor/no-tools', supported_parameters: [] },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(discoverOpenRouterModels('test-key')).resolves.toEqual([
      expect.objectContaining({
        modelId: 'vendor/tools-only',
        capabilities: expect.objectContaining({
          inputModalities: expect.objectContaining({ text: true }),
          toolCalling: true,
        }),
      }),
      expect.objectContaining({
        modelId: 'vendor/no-tools',
        capabilities: expect.objectContaining({
          inputModalities: expect.objectContaining({ text: true }),
          toolCalling: false,
        }),
      }),
    ]);
  });
});
