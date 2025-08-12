import type { ToolResult } from '@stagewise/agent-types';
import type { History } from '@stagewise/karton-contract';
import type { Tools } from '@stagewise/agent-types';
import { messagesToCoreMessages } from './message-utils.js';
import type { TimeoutManager } from './stream-utils.js';
import { ErrorDescriptions } from './error-utils.js';
import type { TypedToolCall } from 'ai';

// Configuration constants
const BROWSER_TOOL_TIMEOUT = 60000; // 60 seconds for browser tools

type Tool = Tools[keyof Tools];

export type { Tools };

interface ToolCallContext {
  tool: Tool;
  toolName: string;
  toolCallId: string;
  input: any;
  history: History;
  onToolCallComplete?: (result: ToolCallProcessingResult) => void;
}

export interface ToolCallProcessingResult {
  success: boolean;
  toolName: string;
  toolCallId: string;
  duration: number;
  error?: {
    type: 'error' | 'user_interaction_required';
    message: string;
  };
  result?: any;
}

/**
 * Processes a browser-based tool call
 */
export async function processBrowserToolCall(
  context: ToolCallContext,
  timeoutManager: TimeoutManager,
): Promise<ToolCallProcessingResult> {
  const { toolName, toolCallId } = context;

  // Set up timeout for browser tool
  const timeoutKey = `browser-tool-${toolCallId}`;
  timeoutManager.set(
    timeoutKey,
    () => {
      console.warn(`[Agent]: Browser tool ${toolName} timed out`);
    },
    BROWSER_TOOL_TIMEOUT,
  );

  try {
    // TODO: call
    const toolCallResult = {
      result: {
        type: 'tool-result' as const,
        toolName,
        toolCallId,
        result: "Not yet implemented, don't try again",
      },
    };

    // Clear timeout if successful
    timeoutManager.clear(timeoutKey);

    const result: ToolCallProcessingResult = {
      success: true,
      toolName,
      toolCallId,
      duration: 0, // Browser tools don't track duration currently
      result: toolCallResult.result,
    };

    return result;
  } catch (error) {
    const errorDescription = ErrorDescriptions.browserToolError(
      toolName,
      error,
    );
    timeoutManager.clear(timeoutKey);

    const result: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
      duration: 0,
      error: {
        type: 'error',
        message: errorDescription,
      },
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(result);
    }

    throw error;
  }
}

/**
 * Processes a client-side tool call
 */
export async function processClientSideToolCall(
  context: ToolCallContext,
): Promise<ToolCallProcessingResult> {
  const { tool, toolName, toolCallId, input, history } = context;

  const startTime = Date.now();

  // Inline handleClientsideToolCall logic
  let result: {
    error: boolean;
    userInteractionRequired?: boolean;
    userInteractionType?: string;
    userInteractionParams?: any;
    errorMessage?: string;
    result?: ToolResult;
  };

  if (tool.stagewiseMetadata?.runtime !== 'client') {
    result = {
      error: true,
      errorMessage: 'Tool is not clientside',
    };
  } else if (!tool.execute) {
    result = {
      error: true,
      errorMessage: 'Issue with the tool - no handler found',
    };
  } else {
    // Execute the tool
    const executeResult = await tool.execute(input, {
      toolCallId,
      messages: messagesToCoreMessages(history),
    });

    result = {
      error: false,
      userInteractionRequired: false,
      result: executeResult,
    };
  }

  const duration = Date.now() - startTime;

  if (result.error) {
    const errorDescription = ErrorDescriptions.toolCallFailed(
      toolName,
      result.errorMessage || result.error,
      input,
      duration,
    );

    const processResult: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
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
  } else if (result.userInteractionRequired) {
    const processResult: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
      duration,
      error: {
        type: 'user_interaction_required',
        message: 'User interaction required',
      },
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(processResult);
    }

    return processResult;
  } else {
    // Successful completion
    const processResult: ToolCallProcessingResult = {
      success: true,
      toolName,
      toolCallId,
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
 * Processes a single tool call based on its runtime
 * Note: This no longer adds the assistant message - that's handled at a higher level
 */
export async function processToolCall(
  context: ToolCallContext,
  timeoutManager: TimeoutManager,
): Promise<ToolCallProcessingResult> {
  const { tool } = context;

  // Process based on runtime
  if (tool.stagewiseMetadata?.runtime === 'browser') {
    return await processBrowserToolCall(context, timeoutManager);
  } else {
    return await processClientSideToolCall(context);
  }
}

/**
 * Processes multiple tool calls in parallel
 */
export async function processParallelToolCalls(
  toolCalls: TypedToolCall<
    Record<string, { description: string; inputSchema: any }>
  >[],
  tools: Tools,
  history: History,
  timeoutManager: TimeoutManager,
  onToolCallComplete?: (result: ToolCallProcessingResult) => void,
): Promise<ToolCallProcessingResult[]> {
  // Process all tool calls
  const results: ToolCallProcessingResult[] = [];

  // Separate browser tools from client-side tools
  const browserToolCalls = toolCalls.filter(
    (tc) => tools[tc.toolName]?.stagewiseMetadata?.runtime === 'browser',
  );
  const clientToolCalls = toolCalls.filter(
    (tc) => tools[tc.toolName]?.stagewiseMetadata?.runtime !== 'browser',
  );

  // Process client-side tools in parallel
  const clientPromises = clientToolCalls.map(async (tc) => {
    const tool = tools[tc.toolName];
    if (!tool) return null;

    const context: ToolCallContext = {
      tool,
      toolName: tc.toolName,
      toolCallId: tc.toolCallId,
      input: tc.input,
      history,
      onToolCallComplete,
    };

    try {
      return await processToolCall(context, timeoutManager);
    } catch (_error) {
      // Error already handled in processToolCall
      return null;
    }
  });

  // Process browser tools sequentially (they may need to interact with the UI)
  for (const tc of browserToolCalls) {
    const tool = tools[tc.toolName];
    if (!tool) continue;

    const context: ToolCallContext = {
      tool,
      toolName: tc.toolName,
      toolCallId: tc.toolCallId,
      input: tc.input,
      history,
    };

    try {
      const result = await processToolCall(context, timeoutManager);
      results.push(result);
    } catch (_error) {
      // Error already handled in processToolCall
    }
  }

  // Wait for all client-side tools to complete
  const clientResults = await Promise.all(clientPromises);
  results.push(
    ...clientResults.filter((r): r is ToolCallProcessingResult => r !== null),
  );

  return results;
}
