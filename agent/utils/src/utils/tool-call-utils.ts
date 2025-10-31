import type { AllTools } from '@stagewise/agent-tools';
import type { StaticToolCall, TypedToolCall } from 'ai';
import type { History } from '@stagewise/karton-contract';

interface ToolCallContext<T extends StaticToolCall<AllTools>> {
  toolCall: T;
  tool: AllTools[T['toolName']];
  messages: History;
  onToolCallComplete?: (result: ToolCallProcessingResult<T>) => void;
}

export type ToolCallProcessingResult<T extends StaticToolCall<AllTools>> =
  | {
      toolCallId: string;
      duration: number;
      result: ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>;
    }
  | {
      toolCallId: string;
      duration: number;
      error: { message: string };
    }
  | { toolCallId: string; duration: number; userInteractionrequired: true };

/**
 * Processes a client-side tool call
 */
export async function processClientSideToolCall<
  T extends StaticToolCall<AllTools>,
>(context: ToolCallContext<T>): Promise<ToolCallProcessingResult<T>> {
  const { tool, toolCall } = context;

  const startTime = Date.now();

  if (tool.stagewiseMetadata?.requiresUserInteraction) {
    return {
      toolCallId: toolCall.toolCallId,
      duration: 0,
      userInteractionrequired: true,
    };
  } else if (!tool.execute) {
    return {
      toolCallId: toolCall.toolCallId,
      duration: 0,
      error: { message: 'Issue with the tool - no handler found' },
    };
  } else {
    try {
      // Execute the tool
      // TypeScript can't narrow the generic constraint properly, but we know the types match
      // because ToolCallContext ensures tool and toolCall are correctly paired
      const executeResult = await tool.execute(toolCall.input as any, {
        toolCallId: toolCall.toolCallId,
        // messages: uiMessagesToModelMessages(context.messages),
        messages: [], // TODO: Fix the AIConversion error (tool state input-available not supported)!
      });

      return {
        toolCallId: toolCall.toolCallId,
        duration: Date.now() - startTime,
        result: executeResult as ReturnType<
          NonNullable<AllTools[T['toolName']]['execute']>
        >,
      };
    } catch (error) {
      return {
        toolCallId: toolCall.toolCallId,
        duration: Date.now() - startTime,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}

/**
 * Processes multiple tool calls in parallel and returns the results.
 * If the result is { userInteractionrequired: true }, the result should NOT be appended to the tool outputs automatically -
 * the frontend should wait for user interaction and then attach the result to the tool outputs via rpc call.
 *
 * @param toolCalls - The tool calls to process
 * @param tools - The tools to use
 * @param onToolCallComplete - The callback to call when a tool call is complete
 * @returns
 */
export async function processToolCalls(
  toolCalls: TypedToolCall<AllTools>[],
  tools: AllTools,
  messages: History,
  onToolCallComplete?: (
    result: ToolCallProcessingResult<StaticToolCall<AllTools>>,
  ) => void,
): Promise<ToolCallProcessingResult<StaticToolCall<AllTools>>[]> {
  // Process all tool calls
  const results: ToolCallProcessingResult<StaticToolCall<AllTools>>[] = [];

  // Process client-side tools in parallel
  const clientPromises = toolCalls.map(async (tc) => {
    if (tc.invalid) {
      return {
        toolCallId: tc.toolCallId,
        duration: 0,
        error: { message: tc instanceof Error ? tc.message : 'Unknown error' },
      };
    }
    if (tc.dynamic)
      return {
        toolCallId: tc.toolCallId,
        duration: 0,
        error: { message: 'Dynamic tool calls are not supported yet.' },
      };

    const tool = tools[tc.toolName];

    if (!tool)
      return {
        toolCallId: tc.toolCallId,
        duration: 0,
        error: { message: `Tool ${tc.toolName} not found in provided tools.` },
      };

    const context = {
      toolCall: tc,
      tool,
      messages,
      onToolCallComplete,
    };

    return await processClientSideToolCall(context);
  });

  // Wait for all client-side tools to complete
  const clientResults = await Promise.all(clientPromises);
  results.push(...clientResults.filter((r) => r !== null));

  return results;
}
