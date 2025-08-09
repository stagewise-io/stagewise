import { procedure, router } from '../../trpc';
import { zAsyncIterable } from '../../../utils';
import {
  type ChatUpdate,
  chatUpdateSchema,
  type SendMessageRequest,
  sendMessageRequestSchema,
  type CreateChatRequest,
  createChatRequestSchema,
  type UpdateChatTitleRequest,
  updateChatTitleRequestSchema,
  type DeleteMessageAndSubsequentRequest,
  deleteMessageAndSubsequentRequestSchema,
  type ToolApprovalResponse,
  toolApprovalResponseSchema,
  type ToolDefinition,
  toolDefinitionSchema,
} from './types';
import { z } from 'zod';

// Define the implementation interface
export interface ChatImplementation {
  /**
   * Returns a stream of chat updates to the toolbar.
   *
   * ***Always send the current chat list and active chat state immediately after connection.***
   *
   * ***You should not return in this function, as this closes the subscription and will prompt the toolbar to subscribe again.***
   *
   * The toolbar will receive updates for:
   * - Initial chat list
   * - Chat creation/deletion
   * - Active chat switching
   * - New messages
   * - Message part updates (for streaming)
   * - Full chat re-syncs when needed
   */
  getChatUpdates: () => AsyncIterable<ChatUpdate>;

  /**
   * Called when the user sends a new message in the active chat.
   * The agent should validate that the chat exists and is active.
   */
  onSendMessage: (request: SendMessageRequest) => Promise<void>;

  /**
   * Called when the user wants to create a new chat.
   * The agent may reject this if a chat is currently active and not idle.
   * Returns the ID of the newly created chat.
   */
  onCreateChat: (request: CreateChatRequest) => Promise<string>;

  /**
   * Called when the user wants to delete a chat.
   * The agent may reject this if the chat is currently active.
   */
  onDeleteChat: (chatId: string) => Promise<void>;

  /**
   * Called when the user wants to switch to a different chat.
   * The agent may reject this if the current chat is not idle.
   */
  onSwitchChat: (chatId: string) => Promise<void>;

  /**
   * Called when the user wants to update the title of a chat.
   */
  onUpdateChatTitle: (request: UpdateChatTitleRequest) => Promise<void>;

  /**
   * Called when the user wants to delete a message and all subsequent messages.
   * This is critical for maintaining consistency when users want to revise history.
   */
  onDeleteMessageAndSubsequent: (
    request: DeleteMessageAndSubsequentRequest,
  ) => Promise<void>;

  /**
   * Called when the user approves or rejects a tool call that requires approval.
   */
  onToolApproval: (response: ToolApprovalResponse) => Promise<void>;

  /**
   * Called by the toolbar to register available tools.
   * Similar to the old tool-calling capability but integrated into chat.
   */
  onToolRegistration: (tools: ToolDefinition[]) => void;

  /**
   * Called when a toolbar-runtime tool call completes.
   * The toolbar will automatically execute these and return results.
   */
  onToolResult: (
    toolCallId: string,
    result: unknown,
    isError?: boolean,
  ) => void;

  /**
   * Called when the user wants to stop the agent's current operation.
   * The agent should handle this gracefully.
   */
  onStop?: () => Promise<void>;
}

// Define the sub-router
export const chatRouter = (impl: ChatImplementation) =>
  router({
    getChatUpdates: procedure
      .output(
        zAsyncIterable({
          yield: chatUpdateSchema,
        }),
      )
      .subscription(impl.getChatUpdates),

    sendMessage: procedure
      .input(sendMessageRequestSchema)
      .mutation(({ input }) => impl.onSendMessage(input)),

    createChat: procedure
      .input(createChatRequestSchema)
      .output(z.string())
      .mutation(({ input }) => impl.onCreateChat(input)),

    deleteChat: procedure
      .input(z.string())
      .mutation(({ input }) => impl.onDeleteChat(input)),

    switchChat: procedure
      .input(z.string())
      .mutation(({ input }) => impl.onSwitchChat(input)),

    updateChatTitle: procedure
      .input(updateChatTitleRequestSchema)
      .mutation(({ input }) => impl.onUpdateChatTitle(input)),

    deleteMessageAndSubsequent: procedure
      .input(deleteMessageAndSubsequentRequestSchema)
      .mutation(({ input }) => impl.onDeleteMessageAndSubsequent(input)),

    approveToolCall: procedure
      .input(toolApprovalResponseSchema)
      .mutation(({ input }) => impl.onToolApproval(input)),

    registerTools: procedure
      .input(z.array(toolDefinitionSchema))
      .mutation(({ input }) => impl.onToolRegistration(input)),

    reportToolResult: procedure
      .input(
        z.object({
          toolCallId: z.string(),
          result: z.unknown(),
          isError: z.boolean().optional(),
        }),
      )
      .mutation(({ input }) =>
        impl.onToolResult(input.toolCallId, input.result, input.isError),
      ),

    stop: procedure.mutation(() =>
      impl.onStop ? impl.onStop() : Promise.resolve(),
    ),
  });
