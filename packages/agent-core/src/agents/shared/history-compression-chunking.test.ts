import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentMessage } from '../../types/agent';
import type { HostModels, ModelWithOptions } from '../../host/models';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { generateText } from 'ai';
import {
  generateSimpleCompressedHistory,
  splitCompactHistoryIntoChunks,
} from './history-compression';

const generateTextMock = vi.mocked(generateText);

const CHAR_BUDGET = 240_000; // COMPRESSION_INPUT_TOKEN_BUDGET * 4

function makeMockHostModels(): HostModels {
  return {
    getWithOptions: vi.fn(
      async (): Promise<ModelWithOptions> => ({
        model: { id: 'mock-model' } as unknown as ModelWithOptions['model'],
        providerOptions: {},
        headers: {},
        contextWindowSize: 1_000_000,
        providerMode: 'stagewise',
        reasoningSignatureSource: {
          providerMode: 'stagewise',
          provider: 'anthropic',
          modelId: 'anthropic/claude-sonnet-4.6',
        },
      }),
    ),
    get: vi.fn(),
    has: vi.fn().mockReturnValue(true),
  } as unknown as HostModels;
}

function makeUserMessage(id: string, chars: number): AgentMessage {
  return {
    id,
    role: 'user',
    parts: [{ type: 'text', text: 'x'.repeat(chars) }],
    metadata: { createdAt: new Date(), partsMetadata: [] },
  } as AgentMessage;
}

beforeEach(() => {
  generateTextMock.mockReset();
});

describe('splitCompactHistoryIntoChunks', () => {
  it('returns a single chunk when the input fits the budget', () => {
    const input = '<user>hello</user>\n<assistant>hi</assistant>';
    expect(splitCompactHistoryIntoChunks(input, CHAR_BUDGET)).toEqual([input]);
  });

  it('splits at block boundaries without breaking XML tags', () => {
    const input = [makeUserMessage('a', 100_000), makeUserMessage('b', 100_000)]
      .map((m) => `<user>${(m.parts[0] as { text: string }).text}</user>`)
      .join('\n');

    const chunks = splitCompactHistoryIntoChunks(input, 150_000);

    expect(chunks.length).toBe(2);
    for (const chunk of chunks) {
      expect(chunk.startsWith('<user>')).toBe(true);
      expect(chunk.endsWith('</user>')).toBe(true);
    }
    expect(chunks.join('\n')).toBe(input);
  });

  it('head/tail-truncates a single block that exceeds the budget', () => {
    const input = `<user>${'y'.repeat(CHAR_BUDGET + 50_000)}</user>`;

    const chunks = splitCompactHistoryIntoChunks(input, CHAR_BUDGET);

    expect(chunks.length).toBe(1);
    expect(chunks[0]!.length).toBeLessThanOrEqual(CHAR_BUDGET);
    expect(chunks[0]).toContain('characters omitted for length');
  });
});

describe('generateSimpleCompressedHistory chunked path', () => {
  it('uses a single call when the serialized history fits the budget', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'A sufficiently long single-pass briefing for the small history.',
    } as any);

    const hostModels = makeMockHostModels();
    await generateSimpleCompressedHistory(
      [makeUserMessage('a', 100), makeUserMessage('b', 100)],
      hostModels,
      'agent-1',
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('maps segments and merges when the history exceeds the budget', async () => {
    generateTextMock
      .mockResolvedValueOnce({
        text: 'Partial briefing for segment one.',
      } as any)
      .mockResolvedValueOnce({
        text: 'Partial briefing for segment two.',
      } as any)
      .mockResolvedValueOnce({
        text: 'Merged briefing combining both segments into one memory.',
      } as any);

    const hostModels = makeMockHostModels();
    const result = await generateSimpleCompressedHistory(
      [
        makeUserMessage('a', 100_000),
        makeUserMessage('b', 100_000),
        makeUserMessage('c', 100_000),
      ],
      hostModels,
      'agent-1',
    );

    expect(result).toBe(
      'Merged briefing combining both segments into one memory.',
    );
    expect(generateTextMock).toHaveBeenCalledTimes(3);

    const systemPrompts = generateTextMock.mock.calls.map(
      (call) =>
        (call[0] as any).messages.find((m: any) => m.role === 'system').content,
    );
    // First two calls are segment summaries, the last one is the merge.
    expect(systemPrompts[0]).toContain('partial');
    expect(systemPrompts[1]).toContain('partial');
    expect(systemPrompts[2]).toContain('merging');
  });

  it('keeps a single oversized block to one bounded call', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'A briefing produced from the truncated single block.',
    } as any);

    const hostModels = makeMockHostModels();
    await generateSimpleCompressedHistory(
      [makeUserMessage('a', CHAR_BUDGET + 50_000)],
      hostModels,
      'agent-1',
    );

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    const userMessage = (
      generateTextMock.mock.calls[0][0] as any
    ).messages.find((m: any) => m.role === 'user').content;
    expect(userMessage).toContain('characters omitted for length');
  });
});
