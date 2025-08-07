// Export all the types users might need
export type * from './router/capabilities/availability/types';
export type * from './router/capabilities/state/types';

// Export messaging types except UserMessage and userMessageSchema which conflict with chat
export type {
  AgentMessageContentItemPart,
  AgentMessageUpdate,
  UserMessageContentItem,
} from './router/capabilities/messaging/types';

// Export chat types with UserMessage as ChatUserMessage to avoid conflict
export type {
  TextPart,
  FilePart,
  ReasoningPart,
  ToolCallPart,
  ToolResultPart,
  ToolApprovalPart,
  UserMessage as ChatUserMessage,
  AssistantMessage,
  ToolMessage,
  ChatMessage,
  Chat,
  ChatListItem,
  MessagePartUpdate,
  ChatUpdate,
  CreateChatRequest,
  SendMessageRequest,
  UpdateChatTitleRequest,
  DeleteMessageAndSubsequentRequest,
  ToolApprovalResponse,
  ToolDefinition,
} from './router/capabilities/chat/types';

// Export shared types for metadata
export type {
  UserMessageMetadata,
  SelectedElement,
  PluginContentItem,
} from './shared-types/metadata';

export { createAgentServer as createOriginalAgentServer } from './agent/index';
export type { AgentInterface } from './agent/interface';
