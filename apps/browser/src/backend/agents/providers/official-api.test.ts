import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateText } = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('ai', () => ({ generateText }));

import { deepseekApiType } from './official-api';

describe('factory-created official API providers', () => {
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
});
