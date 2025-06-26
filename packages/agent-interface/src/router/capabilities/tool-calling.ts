import { z } from 'zod';
import { procedure, router } from '../trpc';
import { zAsyncIterable } from '../../utils';

// 1. DEFINE ALL TYPES AND SCHEMAS
const pendingToolCallSchema = z.object({
  toolName: z.string(),
});

export type PendingToolCall = z.infer<typeof pendingToolCallSchema>;

const toolCallResultSchema = z.object({
  toolName: z.string(),
});

export type ToolCallResult = z.infer<typeof toolCallResultSchema>;

const toolSchema = z.object({
  toolName: z.string().min(4).max(32),
  description: z.string().min(4).max(64),
  parameters: z.object({}), // This is a JSON Schema, because we cant send Zod schemas
});

export type Tool = z.infer<typeof toolSchema>;

const toolListSchema = z.array(toolSchema);

export type ToolList = z.infer<typeof toolListSchema>;

// 2. DEFINE THE IMPLEMENTATION INTERFACE
export interface ToolCallingImplementation {
  /** Informs the toolbar about the open tool calls of the agent that should be executed by toolbar provided tools.
   *
   * ***You must re-yield all pending tool calls that have not yet timed out upon initial subscription of the toolbar.***
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   */
  getPendingToolCalls: () => AsyncIterable<PendingToolCall>;

  /**
   * Informs the agent that a tool call has been completed and returns the result
   *
   * *Make sure to ignore a result if it's call ID is unknown, timed-out, or already handled.*
   *
   * @param response - The result of the tool call.
   */
  onToolCallResult: (response: ToolCallResult) => void;

  /**
   * Informs the agent about tools that it has available.
   *
   * The list also includes tool definitions that may have already been sent over previously.
   *
   * *Upon establishing a connect to the agent, the toolbar will automatically send over the list of tools it has available.*
   *
   * @param toolList The list of tools that the toolbar makes available to the agent
   */
  onToolListUpdate: (toolList: ToolList) => void;
}

// 3. DEFINE THE SUB-ROUTER
export const toolCallingRouter = (impl: ToolCallingImplementation) =>
  router({
    getPendingToolCalls: procedure
      .output(
        zAsyncIterable({
          yield: pendingToolCallSchema,
        }),
      )
      .subscription(impl.getPendingToolCalls),
    sendToolCallResult: procedure
      .input(toolCallResultSchema)
      .mutation(({ input }) => impl.onToolCallResult(input)),
    sendToolListUpdate: procedure
      .input(toolListSchema)
      .mutation(({ input }) => impl.onToolListUpdate(input)),
  });
