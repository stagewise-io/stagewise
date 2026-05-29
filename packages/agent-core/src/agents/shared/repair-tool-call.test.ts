import { describe, it, expect } from 'vitest';
import { NoSuchToolError, tool, type Tool } from 'ai';
import { z } from 'zod';
import { repairToolCall } from './repair-tool-call';

function makeFakeTool(): Tool {
  return tool({
    description: 'Fake tool for repair-handler tests',
    inputSchema: z.object({
      explanation: z.string(),
      count: z.number().int().max(10).optional(),
    }),
  });
}

function makeToolCall(toolName: string, input: string) {
  return {
    toolName,
    input,
    toolCallId: 'call_test',
    type: 'tool-call' as const,
  };
}

// The repair handler receives extra fields at runtime (messages, system,
// toolCallId, inputSchema, etc.). Our implementation only reads toolCall,
// tools, and error, so the tests construct the minimal shape it consumes.

describe('repairToolCall', () => {
  it('returns null when the error is NoSuchToolError', async () => {
    const tools = { fake: makeFakeTool() };
    const noSuchTool = new NoSuchToolError({ toolName: 'nope' });

    const result = await repairToolCall({
      toolCall: makeToolCall('nope', '{}'),
      tools,
      error: noSuchTool,
    });

    expect(result).toBeNull();
  });

  it('throws a zod-issue-enriched error for valid JSON that fails schema', async () => {
    const tools = { fake: makeFakeTool() };
    // Missing `explanation` (required) and `count` over the max.
    const invalidInput = JSON.stringify({ count: 50 });

    await expect(
      repairToolCall({
        toolCall: makeToolCall('fake', invalidInput),
        tools,
        error: new Error('upstream schema error'),
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /Schema validation failed for "fake":[\s\S]*- explanation:[\s\S]*- count:/,
        ),
      }),
    );
  });

  it('lists every offending path (not just the first)', async () => {
    const tools = { fake: makeFakeTool() };
    const invalidInput = JSON.stringify({ count: 50 });

    try {
      await repairToolCall({
        toolCall: makeToolCall('fake', invalidInput),
        tools,
        error: new Error('upstream'),
      });
      throw new Error('repairToolCall did not throw');
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('- explanation:');
      expect(msg).toContain('- count:');
      expect(msg).toContain(
        "Review the tool's parameter requirements and retry with corrected input.",
      );
    }
  });

  it('throws the generic fallback when schema accepts the parsed input', async () => {
    const tools = { fake: makeFakeTool() };
    // Defensive edge case: AI SDK flagged it but zod says it's fine.
    const validInput = JSON.stringify({ explanation: 'ok' });

    await expect(
      repairToolCall({
        toolCall: makeToolCall('fake', validInput),
        tools,
        error: new Error('upstream schema error'),
      }),
    ).rejects.toThrowError(
      /did not match the expected schema. Check the tool's parameter requirements/,
    );
  });

  it('throws the "empty or near-empty" message for unparseable short input', async () => {
    const tools = { fake: makeFakeTool() };

    await expect(
      repairToolCall({
        toolCall: makeToolCall('fake', ''),
        tools,
        error: new Error('upstream'),
      }),
    ).rejects.toThrowError(/empty or near-empty input/);
  });

  it('throws the "too long" message for unparseable long input', async () => {
    const tools = { fake: makeFakeTool() };
    // > 10 chars, unparseable JSON (truncation scenario)
    const truncatedInput =
      '{"explanation": "this is a very long command that got cut off mid-str';

    await expect(
      repairToolCall({
        toolCall: makeToolCall('fake', truncatedInput),
        tools,
        error: new Error('upstream'),
      }),
    ).rejects.toThrowError(/were too long and most likely exceeded/);
  });

  it('falls back to the generic error when the target tool is missing from the map', async () => {
    const validInputForNothing = JSON.stringify({ any: 'thing' });

    await expect(
      repairToolCall({
        toolCall: makeToolCall('missing', validInputForNothing),
        tools: {},
        error: new Error('upstream'),
      }),
    ).rejects.toThrowError(
      /did not match the expected schema. Check the tool's parameter requirements/,
    );
  });
});
