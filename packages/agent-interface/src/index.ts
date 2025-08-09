// Export chat types with UserMessage as ChatUserMessage to avoid conflict
export type {
  TextPart,
  FilePart,
  ReasoningPart,
  ToolCallPart,
  ToolResultPart,
  ToolApprovalPart,
  UserMessage,
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
export type { InterfaceRouter } from './router';
export { transformer } from './transformer';
export type { StagewiseInfo } from './info';
