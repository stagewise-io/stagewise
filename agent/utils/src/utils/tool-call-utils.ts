import type { AllTools } from '@stagewise/agent-tools';
import { ErrorDescriptions } from './error-utils.js';
import type { StaticToolCall, TypedToolCall } from 'ai';
import type { History } from '@stagewise/karton-contract';

interface ToolCallContext<T extends StaticToolCall<AllTools>> {
  toolCall: T;
  tool: AllTools[T['toolName']];
  messages: History;
  onToolCallComplete?: (
    result: ToolCallProcessingResult<
      ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>
    >,
  ) => void;
}

export interface ToolCallProcessingResult<T> {
  success: boolean;
  toolCallId: string;
  duration: number;
  error?: {
    type: 'error';
    message: string;
  };
  result?: T;
}

/**
 * Processes a client-side tool call
 */
export async function processClientSideToolCall<
  T extends StaticToolCall<AllTools>,
>(
  context: ToolCallContext<T>,
): Promise<
  | ToolCallProcessingResult<
      ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>
    >
  | { userInteractionrequired: true }
> {
  const { tool, toolCall } = context;

  const startTime = Date.now();

  // Inline handleClientsideToolCall logic
  let result: {
    error: boolean;
    errorMessage?: string;
    result?: ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>;
  };

  if (tool.stagewiseMetadata?.requiresUserInteraction) {
    return { userInteractionrequired: true };
  } else if (!tool.execute) {
    // if (!tool.execute) {
    result = {
      error: true,
      errorMessage: 'Issue with the tool - no handler found',
    };
  } else {
    // Execute the tool
    // TypeScript can't narrow the generic constraint properly, but we know the types match
    // because ToolCallContext ensures tool and toolCall are correctly paired
    const executeResult = await tool.execute(toolCall.input as any, {
      toolCallId: toolCall.toolCallId,
      // messages: uiMessagesToModelMessages(context.messages),
      messages: [], // TODO: Fix the AIConversion error (tool state input-available not supported)!
    });

    result = {
      error: false,
      result: executeResult as ReturnType<
        NonNullable<AllTools[T['toolName']]['execute']>
      >,
    };
  }

  const duration = Date.now() - startTime;

  if (result.error) {
    const errorDescription = ErrorDescriptions.toolCallFailed(
      toolCall.toolName,
      result.errorMessage || result.error,
      toolCall.input,
      duration,
    );

    const processResult: ToolCallProcessingResult<
      ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>
    > = {
      success: false,
      toolCallId: toolCall.toolCallId,
      duration,
      error: {
        type: 'error',
        message: errorDescription,
      },
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(processResult);
    }

    return processResult;
  } else {
    // Successful completion
    const processResult: ToolCallProcessingResult<
      ReturnType<NonNullable<AllTools[T['toolName']]['execute']>>
    > = {
      success: true,
      toolCallId: toolCall.toolCallId,
      duration,
      result: result.result,
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(processResult);
    }

    return processResult;
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
    result: ToolCallProcessingResult<
      ReturnType<NonNullable<AllTools[keyof AllTools]['execute']>>
    >,
  ) => void,
) {
  // Process all tool calls
  const results: (
    | ToolCallProcessingResult<
        ReturnType<NonNullable<AllTools[keyof AllTools]['execute']>>
      >
    | { userInteractionrequired: true }
  )[] = [];

  // Process client-side tools in parallel
  const clientPromises = toolCalls.map(async (tc) => {
    if (tc.invalid) {
      const errorDescription = ErrorDescriptions.toolCallFailed(
        tc.toolName,
        tc.error,
        tc.input,
        0,
      );
      return {
        success: false,
        toolCallId: tc.toolCallId,
        duration: 0,
        error: {
          type: 'error' as const,
          message: errorDescription,
        },
      };
    }
    if (tc.dynamic)
      throw new Error('Dynamic tool calls are not supported yet.');

    const tool = tools[tc.toolName];

    if (!tool)
      throw new Error(`Tool ${tc.toolName} not found in provided tools.`);

    const context = {
      toolCall: tc,
      tool,
      messages,
      onToolCallComplete,
    };

    try {
      return await processClientSideToolCall(context);
    } catch (_error) {
      // Error already handled in processToolCall
      return null;
    }
  });

  // Wait for all client-side tools to complete
  const clientResults = await Promise.all(clientPromises);
  results.push(...clientResults.filter((r) => r !== null));

  return results;
}
