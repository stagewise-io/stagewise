import type { CoreMessage } from 'ai';
import type {
  AgentServer,
  UserMessage,
} from '@stagewise/agent-interface-internal/agent';
import type { Tools } from '@stagewise/agent-types';
import { AgentStateType } from '@stagewise/agent-interface-internal/agent';
import { handleClientsideToolCall } from './handle-clientside-tool-call.js';
import {
  createAssistantToolCallsMessage,
  messagesToCoreMessages,
} from './message-utils.js';
import { withTimeout, type TimeoutManager } from './stream-utils.js';
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
  server: AgentServer;
  history: (CoreMessage | UserMessage)[];
  setAgentState: (state: AgentStateType, description?: string) => void;
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
  const { toolName, toolCallId, args, server, setAgentState } = context;

  // Set up timeout for browser tool
  const timeoutKey = `browser-tool-${toolCallId}`;
  timeoutManager.set(
    timeoutKey,
    () => {
      console.warn(`[Agent]: Browser tool ${toolName} timed out`);
      setAgentState(AgentStateType.IDLE, 'Browser tool timeout');
    },
    BROWSER_TOOL_TIMEOUT,
  );

  try {
    const toolCallResult = await withTimeout(
      server.interface.toolCalling.requestToolCall(
        toolName,
        args as Record<string, unknown>,
      ),
      BROWSER_TOOL_TIMEOUT,
      'Browser tool timeout',
    );

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
    console.error(`[Agent]: ${errorDescription}`);
    timeoutManager.clear(timeoutKey);
    setAgentState(AgentStateType.FAILED, errorDescription);

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
 * Processes a client-side tool call
 */
export async function processClientSideToolCall(
  context: ToolCallContext,
): Promise<ToolCallProcessingResult> {
  const { tool, toolName, toolCallId, args, history, setAgentState } = context;

  const startTime = Date.now();
  const result = await handleClientsideToolCall(
    tool,
    toolCallId,
    messagesToCoreMessages(history),
    args,
  );
  const duration = Date.now() - startTime;

  if (result.error) {
    const errorDescription = ErrorDescriptions.toolCallFailed(
      toolName,
      result.error,
      args,
      duration,
    );
    setAgentState(AgentStateType.FAILED, errorDescription);

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
      setAgentState(AgentStateType.IDLE);
    }, 2000);

    return processResult;
  } else if (result.userInteractionRequired) {
    setAgentState(AgentStateType.WAITING_FOR_USER_RESPONSE);

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
  server: AgentServer,
  history: (CoreMessage | UserMessage)[],
  setAgentState: (state: AgentStateType, description?: string) => void,
  timeoutManager: TimeoutManager,
  onToolCallComplete?: (result: ToolCallProcessingResult) => void,
): Promise<void> {
  // Add assistant message with all tool calls
  history.push(createAssistantToolCallsMessage(toolCalls));

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
      server,
      history,
      setAgentState,
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
      server,
      history,
      setAgentState,
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
    history.push({
      role: 'tool',
      content: successfulResults,
    });
  }
}

/**
 * Determines if the agent should make a recursive call after tool execution
 */
export function shouldRecurseAfterToolCall(
  history: (CoreMessage | UserMessage)[],
): boolean {
  const lastMessage = history[history.length - 1];

  if (!lastMessage || 'contentItems' in lastMessage) {
    return false;
  }

  return (
    lastMessage.role === 'tool' &&
    Array.isArray(lastMessage.content) &&
    lastMessage.content[0]?.type === 'tool-result'
  );
}
