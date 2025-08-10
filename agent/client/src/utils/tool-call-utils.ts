import type { ToolResult } from '@stagewise/agent-types';
import type { KartonServer } from '@stagewise/karton/server';
import type { KartonContract, History } from '@stagewise/karton-contract';
import type { Tools } from '@stagewise/agent-types';
import { messagesToCoreMessages } from './message-utils.js';
import type { TimeoutManager } from './stream-utils.js';
import { ErrorDescriptions } from './error-utils.js';

// Configuration constants
const BROWSER_TOOL_TIMEOUT = 60000; // 60 seconds for browser tools

type Tool = Tools[keyof Tools];

export type { Tools };

interface ToolCallContext {
  tool: Tool;
  toolName: string;
  toolCallId: string;
  args: any;
  karton: KartonServer<KartonContract>;
  history: History;
  setWorkingState: (state: boolean, description?: string) => void;
  onToolCallComplete?: (result: ToolCallProcessingResult) => void;
}

export interface ToolCallProcessingResult {
  success: boolean;
  toolName: string;
  toolCallId: string;
  duration: number;
  error?: 'error' | 'user_interaction_required';
  result?: any;
}

/**
 * Processes a browser-based tool call
 */
export async function processBrowserToolCall(
  context: ToolCallContext,
  timeoutManager: TimeoutManager,
): Promise<ToolCallProcessingResult> {
  const { toolName, toolCallId, setWorkingState } = context;

  // Set up timeout for browser tool
  const timeoutKey = `browser-tool-${toolCallId}`;
  timeoutManager.set(
    timeoutKey,
    () => {
      console.warn(`[Agent]: Browser tool ${toolName} timed out`);
      setWorkingState(false, 'Browser tool timeout');
    },
    BROWSER_TOOL_TIMEOUT,
  );

  try {
    // const toolCallResult = await withTimeout(
    //   server.interface.toolCalling.requestToolCall(
    //     toolName,
    //     args as Record<string, unknown>,
    //   ),
    //   BROWSER_TOOL_TIMEOUT,
    //   'Browser tool timeout',
    // );
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

    if (context.onToolCallComplete) {
      context.onToolCallComplete(result);
    }

    return result;
  } catch (error) {
    const errorDescription = ErrorDescriptions.browserToolError(
      toolName,
      error,
    );
    timeoutManager.clear(timeoutKey);
    setWorkingState(false, errorDescription);

    const result: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
      duration: 0,
      error: 'error',
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(result);
    }

    throw error;
  }
}

/**
 * Helper function to check if auto tool calls are allowed
 */
function isAutoToolCallAllowed(tool: Tool) {
  if (tool.stagewiseMetadata?.runtime === 'client') return true;
  else return false;
}

/**
 * Processes a client-side tool call
 */
export async function processClientSideToolCall(
  context: ToolCallContext,
): Promise<ToolCallProcessingResult> {
  const { tool, toolName, toolCallId, args, history, setWorkingState } =
    context;

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

  if (!isAutoToolCallAllowed(tool)) {
    result = {
      error: false,
      userInteractionType: 'user-permission',
      userInteractionRequired: true,
      userInteractionParams: {},
    };
  } else if (tool.stagewiseMetadata?.runtime !== 'client') {
    // This should not happen given the isAutoToolCallAllowed check, but keeping for safety
    result = {
      error: true,
      errorMessage: 'Tool is not clientside',
    };
  } else if (!tool.execute) {
    result = {
      error: true,
      errorMessage: 'Client-side tool needs execute-function',
    };
  } else {
    // Execute the tool
    const executeResult = await tool.execute(args, {
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
      args,
      duration,
    );
    setWorkingState(false, errorDescription);

    const processResult: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
      duration,
      error: 'error',
    };

    if (context.onToolCallComplete) {
      context.onToolCallComplete(processResult);
    }

    // Reset to idle after 2 seconds
    setTimeout(() => {
      setWorkingState(false);
    }, 2000);

    return processResult;
  } else if (result.userInteractionRequired) {
    setWorkingState(true);

    const processResult: ToolCallProcessingResult = {
      success: false,
      toolName,
      toolCallId,
      duration,
      error: 'user_interaction_required',
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
  toolCalls: Array<{
    toolName: string;
    toolCallId: string;
    args: any;
  }>,
  tools: Tools,
  karton: KartonServer<KartonContract>,
  history: History,
  setWorkingState: (state: boolean) => void,
  timeoutManager: TimeoutManager,
  onToolCallComplete?: (result: ToolCallProcessingResult) => void,
): Promise<ToolCallProcessingResult[]> {
  // Add assistant message with all tool calls
  // TODO: update the history via karton
  // history.push(createAssistantToolCallsMessage(toolCalls));

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
      args: tc.args,
      karton,
      history,
      setWorkingState,
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
      args: tc.args,
      karton,
      history,
      setWorkingState,
      onToolCallComplete,
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

  // Add tool results message with all successful results
  // NOTE: 'successful' means NOT that the tool call itself was successful, but the execution of the tool call was successful
  // So the result may still include an error (e.g. agent has picked invalid parameters)
  const successfulResults = results
    .filter((r) => r.success)
    .map((r) => ({
      type: 'tool-result' as const,
      toolName: r.toolName,
      toolCallId: r.toolCallId,
      result: r.result,
    }));

  if (successfulResults.length > 0) {
    // TODO: update the history via karton
    // history.push({
    //   role: 'tool',
    //   content: successfulResults,
    // });
  }

  return results;
}

/**
 * Determines if the agent should make a recursive call after tool execution
 */
export function shouldRecurseAfterToolCall(history: History): boolean {
  const lastMessage = history[history.length - 1];

  if (!lastMessage || 'contentItems' in lastMessage) {
    return false;
  }

  return false;
  // TODO: fix this
  // return (
  //   lastMessage.role === 'tool' &&
  //   Array.isArray(lastMessage.content) &&
  //   lastMessage.content[0]?.type === 'tool-result'
  // );
}
