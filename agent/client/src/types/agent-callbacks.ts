import type { KartonContract, ChatMessage } from '@stagewise/karton-contract';

type KartonState = KartonContract['state'];
type StateRecipe = (draft: KartonState) => void;

export type AgentStateGetter = () => KartonState;
export type AgentStateSetter = (recipe: StateRecipe) => KartonState;

export interface AgentCallbacks {
  getState: AgentStateGetter;
  setState: AgentStateSetter;
}

export interface AgentProcedures {
  undoToolCallsUntilUserMessage: (
    userMessageId: string,
    chatId: string,
  ) => Promise<void>;
  undoToolCallsUntilLatestUserMessage: (
    chatId: string,
  ) => Promise<ChatMessage | null>;
  retrySendingUserMessage: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  abortAgentCall: () => Promise<void>;
  approveToolCall: (
    toolCallId: string,
    callingClientId: string,
  ) => Promise<void>;
  rejectToolCall: (
    toolCallId: string,
    callingClientId: string,
  ) => Promise<void>;
  createChat: () => Promise<string>;
  switchChat: (chatId: string, callingClientId: string) => Promise<void>;
  deleteChat: (chatId: string, callingClientId: string) => Promise<void>;
  sendUserMessage: (
    message: ChatMessage,
    callingClientId: string,
  ) => Promise<void>;
  assistantMadeCodeChangesUntilLatestUserMessage: (
    chatId: string,
  ) => Promise<boolean>;
}
