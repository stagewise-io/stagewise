import type { InterfaceRouter } from '../router';

export type { InterfaceRouter };

export {
  type AgentAvailability,
  AgentAvailabilityError,
} from '../router/capabilities/availability/types';

export {
  type AgentState,
  AgentStateType,
} from '../router/capabilities/state/types';

export {
  type UserMessage,
  userMessageSchema,
  type UserMessageContentItem,
  type AgentMessageContentItemPart,
  type AgentMessageUpdate,
} from '../router/capabilities/messaging/types';

export type {
  // Re-export chat types, excluding those that conflict with messaging
  TextPart,
  FilePart,
  ReasoningPart,
  ToolCallPart,
  ToolResultPart,
  ToolApprovalPart,
  AssistantMessage,
  ToolMessage,
  ChatMessage,
  Chat,
  ChatListItem,
  MessagePartUpdate,
  ChatUpdate,
  CreateChatRequest,
  SendMessageRequest,
  ToolApprovalResponse,
  ToolDefinition,
  UserMessage as ChatUserMessage, // Export with alias to avoid conflict
} from '../router/capabilities/chat/types';

export type { StagewiseInfo } from '../info';

export { DEFAULT_STARTING_PORT } from '../constants';

export { transformer } from '../transformer';
