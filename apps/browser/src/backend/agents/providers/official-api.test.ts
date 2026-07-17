import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateText } = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('ai', () => ({ generateText }));

import { deepseekApiType, minimaxApiType } from './official-api';

describe('official API providers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    generateText.mockReset();
  });

  it('bounds credential validation requests to ten seconds', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    generateText.mockResolvedValue({});

    await deepseekApiType.validateCredentials!(
      { encryptedApiKey: 'encrypted' },
      { encryptedApiKey: 'test-key' },
    );

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });

  it('falls back to MiniMax-M3 when the primary validation model fails', async () => {
    generateText
      .mockRejectedValueOnce(new Error('model unavailable'))
      .mockResolvedValueOnce({});

    const result = await minimaxApiType.validateCredentials!(
      { encryptedApiKey: 'encrypted' },
      { encryptedApiKey: 'test-key' },
    );

    expect(result).toEqual({ success: true });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[0]?.[0].model.modelId).toBe('minimax-m2.7');
    expect(generateText.mock.calls[1]?.[0].model.modelId).toBe('MiniMax-M3');
  });
});
