import { afterEach, describe, expect, it, vi } from 'vitest';

const { generateText } = vi.hoisted(() => ({
  generateText: vi.fn(),
}));

vi.mock('ai', () => ({ generateText }));

import { deepseekApiType, minimaxApiType } from './official-api';
import { getAvailableModel } from '@shared/available-models';
import { createThinkingProviderOptionsPatch } from '@shared/model-thinking-capabilities';

describe('official API providers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    generateText.mockReset();
  });

  it('serializes the DeepSeek Max selection through the SDK as max', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'completion',
          created: 0,
          model: 'deepseek-flash',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'ok' },
              finish_reason: 'stop',
            },
          ],
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    );
    const catalogModel = getAvailableModel('deepseek-v4.1-flash')!;
    const { model } = deepseekApiType.createLanguageModel({
      modelId: deepseekApiType.toWireModelId!(catalogModel.modelId),
      apiKey: 'test-key',
      baseURL: 'https://deepseek.test/v1',
      config: {},
      decryptedConfig: {},
    });
    const patch = createThinkingProviderOptionsPatch({
      model: catalogModel,
      route: { providerMode: 'official', modelProvider: 'deepseek' },
      override: { enabled: true, value: 'max' },
    });
    await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      providerOptions: patch as { openai: { reasoningEffort: string } },
    });
    expect(
      JSON.parse(fetchSpy.mock.calls[0]?.[1]?.body as string),
    ).toMatchObject({
      model: 'deepseek-flash',
      reasoning_effort: 'max',
    });
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
