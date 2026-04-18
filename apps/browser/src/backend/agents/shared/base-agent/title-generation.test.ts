import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ModelProviderService } from '@/agents/model-provider';

// ---------------------------------------------------------------------------
// Mock `ai` module — must be before the import of the module under test
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// We import *after* vi.mock so vitest can intercept
import { generateText } from 'ai';
import { generateSimpleTitle } from './title-generation';

const generateTextMock = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessages(count: number): AgentMessage[] {
  const msgs: AgentMessage[] = [];
  for (let i = 0; i < count; i++) {
    msgs.push({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      parts: [{ type: 'text', text: `Message ${i}` }],
      metadata: { createdAt: new Date(), partsMetadata: [] },
    } as AgentMessage);
  }
  return msgs;
}

function makeMockModelProviderService(): ModelProviderService {
  return {
    getModelWithOptions: vi.fn().mockReturnValue({
      model: { id: 'mock-model' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    }),
  } as unknown as ModelProviderService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateSimpleTitle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the title from the first model when it succeeds', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'My Title' } as any);

    const mps = makeMockModelProviderService();
    const promise = generateSimpleTitle(makeMessages(2), mps, 'agent-1');
    // No timeout needed — resolves immediately
    const title = await promise;

    expect(title).toBe('My Title');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    // Should use the primary model
    expect(mps.getModelWithOptions).toHaveBeenCalledWith(
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.objectContaining({ $ai_span_name: 'title-generation' }),
    );
  });

  it('falls back to the second model when the first fails', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockResolvedValueOnce({ text: 'GPT Title' } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('GPT Title');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
  });

  it('falls back to the third model when the first two fail', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockRejectedValueOnce(new Error('GPT failed'))
      .mockResolvedValueOnce({ text: 'Haiku Title' } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('Haiku Title');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      3,
      'claude-haiku-4.5',
      'agent-1',
      expect.any(Object),
    );
  });

  it('throws when all three models fail', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockRejectedValueOnce(new Error('GPT failed'))
      .mockRejectedValueOnce(new Error('Haiku failed'));

    const mps = makeMockModelProviderService();
    await expect(
      generateSimpleTitle(makeMessages(2), mps, 'agent-1'),
    ).rejects.toThrow('Haiku failed');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
  });

  it('falls back when getModelWithOptions throws for a model', async () => {
    const mps = makeMockModelProviderService();
    const getModelMock = vi.mocked(mps.getModelWithOptions);

    // First model: provider throws (model not found)
    getModelMock.mockImplementationOnce(() => {
      throw new Error('Model not found');
    });
    // Second model: works
    getModelMock.mockReturnValueOnce({
      model: { id: 'gpt-mock' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    } as any);
    generateTextMock.mockResolvedValueOnce({ text: 'Fallback Title' } as any);

    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');
    expect(title).toBe('Fallback Title');
  });

  it('passes an abortSignal to generateText', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'Valid Title' } as any);

    const mps = makeMockModelProviderService();
    await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('falls back when the abort signal fires (simulating timeout)', async () => {
    // First call: simulate an abort error
    generateTextMock.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    // Second call: succeeds
    generateTextMock.mockResolvedValueOnce({
      text: 'Fallback After Timeout',
    } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('Fallback After Timeout');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a hanging first model via the 30s timeout and falls back', async () => {
    // First call: simulate a model that never responds — it only rejects
    // when the AbortController fires.
    generateTextMock.mockImplementationOnce(({ abortSignal }: any) => {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    // Second call: resolves immediately
    generateTextMock.mockResolvedValueOnce({
      text: 'Timeout Fallback Title',
    } as any);

    const mps = makeMockModelProviderService();
    const promise = generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    // Advance past the 30 s timeout
    await vi.advanceTimersByTimeAsync(30_000);

    const title = await promise;
    expect(title).toBe('Timeout Fallback Title');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    // First model attempted, then fallback
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      1,
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
  });

  it('exhausts all models via timeout and throws', async () => {
    // All three models fail instantly (simulates what happens after abort)
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    generateTextMock
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError)
      .mockRejectedValueOnce(abortError);

    const mps = makeMockModelProviderService();
    await expect(
      generateSimpleTitle(makeMessages(2), mps, 'agent-1'),
    ).rejects.toThrow('aborted');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    // Verify all three model IDs were attempted in order
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      1,
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      2,
      'gpt-5.4-nano',
      'agent-1',
      expect.any(Object),
    );
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      3,
      'claude-haiku-4.5',
      'agent-1',
      expect.any(Object),
    );
  });

  it('uses only the last 10 messages for context', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'Valid Title' } as any);

    const mps = makeMockModelProviderService();
    const messages = makeMessages(20);
    await generateSimpleTitle(messages, mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    const userContent = callArgs.messages[1].content as string;
    // Should contain at most 10 message entries
    const messageLines = userContent
      .replace('<conversation>', '')
      .replace('</conversation>', '')
      .split('\n')
      .filter((l: string) => l.trim().length > 0);
    expect(messageLines.length).toBeLessThanOrEqual(10);
  });

  it('falls back when the title is shorter than 6 characters', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: 'Hi' } as any)
      .mockResolvedValueOnce({ text: 'A Good Title' } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('A Good Title');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('accepts a title that is exactly 6 characters', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'Fix It' } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('Fix It');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace before checking length', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: '  ab  ' } as any)
      .mockResolvedValueOnce({ text: 'Proper Title' } as any);

    const mps = makeMockModelProviderService();
    const title = await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    expect(title).toBe('Proper Title');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('disables anthropic thinking via providerOptions', async () => {
    generateTextMock.mockResolvedValueOnce({ text: 'Valid Title' } as any);

    const mps = makeMockModelProviderService();
    await generateSimpleTitle(makeMessages(2), mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    expect(callArgs.providerOptions).toMatchObject({
      anthropic: { thinking: { type: 'disabled' } },
    });
  });
});
