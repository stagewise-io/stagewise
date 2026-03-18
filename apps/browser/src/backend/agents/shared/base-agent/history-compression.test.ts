import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AgentMessage } from '@shared/karton-contracts/ui/agent';
import type { ModelProviderService } from '@/agents/model-provider';

// ---------------------------------------------------------------------------
// Mock `ai` module
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import {
  generateSimpleCompressedHistory,
  convertAgentMessagesToCompactMessageHistoryString,
} from './history-compression';

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
// convertAgentMessagesToCompactMessageHistoryString
// ---------------------------------------------------------------------------

describe('convertAgentMessagesToCompactMessageHistoryString', () => {
  it('converts user and assistant messages to XML format', () => {
    const messages = makeMessages(4);
    const result = convertAgentMessagesToCompactMessageHistoryString(messages);

    expect(result).toContain('<user>Message 0</user>');
    expect(result).toContain('<assistant>Message 1</assistant>');
    expect(result).toContain('<user>Message 2</user>');
    expect(result).toContain('<assistant>Message 3</assistant>');
  });

  it('stops at a message with compressedHistory and includes previous history', () => {
    const messages: AgentMessage[] = [
      {
        id: 'msg-0',
        role: 'user',
        parts: [{ type: 'text', text: 'Old message' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Old response' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
      {
        id: 'msg-2',
        role: 'user',
        parts: [{ type: 'text', text: 'New message' }],
        metadata: {
          createdAt: new Date(),
          partsMetadata: [],
          compressedHistory: 'Previous summary here',
        },
      } as AgentMessage,
      {
        id: 'msg-3',
        role: 'assistant',
        parts: [{ type: 'text', text: 'New response' }],
        metadata: { createdAt: new Date(), partsMetadata: [] },
      } as AgentMessage,
    ];

    const result = convertAgentMessagesToCompactMessageHistoryString(messages);

    // Should include previous-chat-history
    expect(result).toContain(
      '<previous-chat-history>Previous summary here</previous-chat-history>',
    );
    // Should include messages from the compressedHistory message onwards
    expect(result).toContain('<user>New message</user>');
    expect(result).toContain('<assistant>New response</assistant>');
    // Should NOT include messages before the compressedHistory boundary
    expect(result).not.toContain('Old message');
    expect(result).not.toContain('Old response');
  });
});

// ---------------------------------------------------------------------------
// generateSimpleCompressedHistory
// ---------------------------------------------------------------------------

describe('generateSimpleCompressedHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generateTextMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the compressed history from the first model when it succeeds', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'The user asked the assistant to help with a task.',
    } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('The user asked the assistant to help with a task.');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(mps.getModelWithOptions).toHaveBeenCalledWith(
      'gemini-3.1-flash-lite-preview',
      'agent-1',
      expect.objectContaining({ $ai_span_name: 'history-compression' }),
    );
  });

  it('falls back to the second model when the first fails', async () => {
    generateTextMock
      .mockRejectedValueOnce(new Error('Gemini failed'))
      .mockResolvedValueOnce({
        text: 'The assistant provided a GPT-based summary of events.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'The assistant provided a GPT-based summary of events.',
    );
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
      .mockResolvedValueOnce({
        text: 'The assistant provided a Haiku-based summary of events.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'The assistant provided a Haiku-based summary of events.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(3);
    expect(mps.getModelWithOptions).toHaveBeenNthCalledWith(
      3,
      'claude-haiku-4-5',
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
      generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1'),
    ).rejects.toThrow('Haiku failed');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
  });

  it('falls back when the abort signal fires (simulating timeout)', async () => {
    generateTextMock.mockRejectedValueOnce(
      new DOMException('Aborted', 'AbortError'),
    );
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a fallback summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('The assistant provided a fallback summary of events.');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('aborts a hanging first model via the 15s timeout and falls back', async () => {
    generateTextMock.mockImplementationOnce(({ abortSignal }: any) => {
      return new Promise((_resolve, reject) => {
        abortSignal.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a timeout fallback summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    const promise = generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    await vi.advanceTimersByTimeAsync(15_000);

    const result = await promise;
    expect(result).toBe(
      'The assistant provided a timeout fallback summary of events.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
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
      generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1'),
    ).rejects.toThrow('aborted');
    expect(generateTextMock).toHaveBeenCalledTimes(3);
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
      'claude-haiku-4-5',
      'agent-1',
      expect.any(Object),
    );
  });

  it('falls back when the compression is shorter than 30 characters', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: 'Too short' } as any)
      .mockResolvedValueOnce({
        text: 'This is a sufficiently long compression result for the test.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(
      'This is a sufficiently long compression result for the test.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('accepts compression that is exactly 30 characters', async () => {
    const exactly30 = 'a'.repeat(30);
    generateTextMock.mockResolvedValueOnce({ text: exactly30 } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe(exactly30);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace before checking length', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: '   short   ' } as any)
      .mockResolvedValueOnce({
        text: 'A valid compression that is long enough to pass.',
      } as any);

    const mps = makeMockModelProviderService();
    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );

    expect(result).toBe('A valid compression that is long enough to pass.');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('passes an abortSignal to generateText', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a valid summary of events.',
    } as any);

    const mps = makeMockModelProviderService();
    await generateSimpleCompressedHistory(makeMessages(4), mps, 'agent-1');

    const callArgs = generateTextMock.mock.calls[0][0] as any;
    expect(callArgs.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it('falls back when getModelWithOptions throws for a model', async () => {
    const mps = makeMockModelProviderService();
    const getModelMock = vi.mocked(mps.getModelWithOptions);

    getModelMock.mockImplementationOnce(() => {
      throw new Error('Model not found');
    });
    getModelMock.mockReturnValueOnce({
      model: { id: 'gpt-mock' },
      providerOptions: {},
      headers: {},
      contextWindowSize: 100_000,
      providerMode: 'stagewise',
    } as any);
    generateTextMock.mockResolvedValueOnce({
      text: 'The assistant provided a provider-fallback summary of events.',
    } as any);

    const result = await generateSimpleCompressedHistory(
      makeMessages(4),
      mps,
      'agent-1',
    );
    expect(result).toBe(
      'The assistant provided a provider-fallback summary of events.',
    );
  });
});
