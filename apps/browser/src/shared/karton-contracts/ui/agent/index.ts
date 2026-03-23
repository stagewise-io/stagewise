import type { ToolUIPart, UIDataTypes, UIMessage } from 'ai';
import type { ModelId } from '@shared/available-models';
import type { UserMessageMetadata } from './metadata';
import type { UIAgentTools } from './tools/types';

export enum AgentTypes {
  CHAT = 'chat',
  WORKSPACE_MD = 'project-md',
}

export type AgentMessage = UIMessage<
  UserMessageMetadata,
  UIDataTypes,
  UIAgentTools
>;

export type AgentToolUIPart = ToolUIPart<UIAgentTools>;

export type ExceededWindow = {
  type: string;
  resetsAt: string;
};

export type AgentRuntimeError =
  | { kind?: undefined; code?: number; message: string; stack?: string }
  | {
      kind: 'plan-limit-exceeded';
      message: string;
      plan?: string;
      exceededWindows: ExceededWindow[];
    };

export type AgentState = {
  title: string; // The title of the agent - may not be necessary
  isWorking: boolean; // Whether the agent is currently working on a task or if it's idling (either finished or waiting for user input).
  history: AgentMessage[]; // The message history of the agent (visible to user)
  queuedMessages: (AgentMessage & { role: 'user' })[]; // Queued messages that have not yet been sent to the agent.
  activeModelId: ModelId; // The model ID that the agent last used
  inputState: string; // Serialized input state - may be simple text or some stringified object if our input field needs that.
  usedTokens: number;
  error?: AgentRuntimeError; // Current error state (not persisted, only available during runtime for UI display)
  unread?: boolean; // Whether the agent has unseen output (not persisted, set on finish/error, cleared by markAsRead)
  usageWarning?: {
    windowType: string;
    usedPercent: number;
    resetsAt: string;
  };
};

export type ToolboxState = {
  pendingFiles: string[];
  // Later on, tool calls that involve interaction with the user should also be placed here!!!
};

export type AgentHistoryEntry = {
  id: string; // agent instance ID
  title: string; // agent title
  createdAt: Date; // agent creation timestamp
  lastMessageAt: Date; // last message timestamp
  messageCount: number; // number of messages in the agent's history
  parentAgentInstanceId: string | null; // parent agent instance ID
};
