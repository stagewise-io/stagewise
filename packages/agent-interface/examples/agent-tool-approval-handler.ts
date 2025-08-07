/**
 * Example: How agents should handle tool approvals in the new UserMessage format
 */

import type {
  ChatUpdate,
  ChatUserMessage as UserMessage,
  ToolApprovalPart,
} from '../dist/agent';
import type { AgentInterface } from '../dist/agent';

/**
 * Example agent that properly handles tool approvals
 */
export class ToolApprovalAwareAgent {
  private pendingToolCalls = new Map<
    string,
    {
      toolName: string;
      originalInput: Record<string, unknown>;
      callback?: (approved: boolean) => void;
    }
  >();

  constructor(private agent: AgentInterface) {
    // Listen for chat updates
    this.agent.chat.addChatUpdateListener(this.handleChatUpdate.bind(this));
  }

  /**
   * Handle incoming chat updates
   */
  private handleChatUpdate(update: ChatUpdate): void {
    // Check for user messages that might contain tool approvals
    if (update.type === 'message-added' && update.message.role === 'user') {
      this.processUserMessage(update.message as UserMessage, update.chatId);
    }
  }

  /**
   * Process a user message for tool approvals
   */
  private processUserMessage(message: UserMessage, chatId: string): void {
    // Check each content part
    for (const part of message.content) {
      if (part.type === 'tool-approval') {
        this.handleToolApproval(part as ToolApprovalPart, chatId);
      }
    }
  }

  /**
   * Handle a tool approval/rejection
   */
  private handleToolApproval(approval: ToolApprovalPart, chatId: string): void {
    const pending = this.pendingToolCalls.get(approval.toolCallId);

    if (!pending) {
      console.warn(
        `Received approval for unknown tool call: ${approval.toolCallId}`,
      );
      return;
    }

    if (approval.approved) {
      console.log(
        `Tool call ${approval.toolCallId} (${pending.toolName}) was APPROVED`,
      );

      // Use original input
      const finalInput = pending.originalInput;

      // Execute the tool with the original input
      this.executeApprovedTool(pending.toolName, finalInput, chatId);

      // Call the callback if provided
      if (pending.callback) {
        pending.callback(true);
      }
    } else {
      console.log(
        `Tool call ${approval.toolCallId} (${pending.toolName}) was REJECTED`,
      );

      // Handle rejection - maybe ask for alternatives
      this.handleRejectedTool(pending.toolName, chatId);

      // Call the callback if provided
      if (pending.callback) {
        pending.callback(false);
      }
    }

    // Clean up
    this.pendingToolCalls.delete(approval.toolCallId);
  }

  /**
   * Register a tool call that needs approval
   */
  public registerPendingToolCall(
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
    callback?: (approved: boolean) => void,
  ): void {
    this.pendingToolCalls.set(toolCallId, {
      toolName,
      originalInput: input,
      callback,
    });
  }

  /**
   * Execute an approved tool
   */
  private executeApprovedTool(
    toolName: string,
    input: Record<string, unknown>,
    chatId: string,
  ): void {
    // Add a message indicating tool execution
    this.agent.chat.addMessage(
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Executing ${toolName} with approved parameters...`,
          },
        ],
        createdAt: new Date(),
      },
      chatId,
    );

    // Here you would actually execute the tool
    console.log(`Executing tool: ${toolName}`, input);
  }

  /**
   * Handle a rejected tool call
   */
  private handleRejectedTool(toolName: string, chatId: string): void {
    // Add a message acknowledging the rejection
    this.agent.chat.addMessage(
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `Understood. I won't execute ${toolName}. Is there something else I can help you with?`,
          },
        ],
        createdAt: new Date(),
      },
      chatId,
    );
  }
}

// Example usage
export function setupAgent(agent: AgentInterface): ToolApprovalAwareAgent {
  const handler = new ToolApprovalAwareAgent(agent);

  // Example: Request a tool that needs approval
  const toolCallId = `tool-${Date.now()}`;

  // Register the pending tool call
  handler.registerPendingToolCall(
    toolCallId,
    'deleteFile',
    { path: '/important/file.txt' },
    (approved) => {
      if (approved) {
        console.log('Tool was approved!');
      } else {
        console.log('Tool was rejected');
      }
    },
  );

  // Add an assistant message requesting approval
  agent.chat.addMessage({
    id: 'assistant-request',
    role: 'assistant',
    content: [
      { type: 'text', text: 'I need to delete a file to proceed.' },
      {
        type: 'tool-call',
        toolCallId,
        toolName: 'deleteFile',
        input: { path: '/important/file.txt' },
        runtime: 'cli',
        requiresApproval: true,
      },
    ],
    createdAt: new Date(),
  });

  return handler;
}
