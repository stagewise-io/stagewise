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
  type UserMessageMetadata,
  userMessageMetadataSchema,
  type SelectedElement,
  type AgentMessageContentItemPart,
  type AgentMessageUpdate,
} from '../router/capabilities/messaging/types';

export {
  // Re-export chat types, excluding those that conflict with messaging
  type TextPart,
  type ImagePart,
  type FilePart,
  type ReasoningPart,
  type ToolCallPart,
  type ToolResultPart,
  type AssistantMessage,
  type ToolMessage,
  type ChatMessage,
  type Chat,
  type ChatListItem,
  type MessagePartUpdate,
  type ChatUpdate,
  type CreateChatRequest,
  type SendMessageRequest,
  type ToolApprovalResponse,
  type ToolDefinition,
  type UserMessage as ChatUserMessage, // Export with alias to avoid conflict
} from '../router/capabilities/chat/types';

export type { StagewiseInfo } from '../info';

export { DEFAULT_STARTING_PORT } from '../constants';

export { transformer } from '../transformer';
