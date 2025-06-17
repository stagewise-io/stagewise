import { useState } from 'preact/hooks';
import type {
  AgentMessageContentItemPart,
  UserMessageContentItem,
} from '../../agent-interface.ts';
import { type ComponentChildren, createContext } from 'preact';

export type UserMessageInput = {
  contentItems: UserMessageContentItem[];
};

export type AgentMessage = {
  id: string;
  contentItems: AgentMessageContentItemPart[];
};

type MessagingContext = {
  /** Used to send messages to the configured agent */
  sendMessage: (message: UserMessageInput) => void;
  /** The current message received from the agent.
   * This one will stay put until a connection is either lost or until a new user message comes in.
   * It thus stores the last active turn. */
  agentMessage: AgentMessage | null;
};

const agentMessagingContext = createContext<MessagingContext>({
  sendMessage: () => {},
  agentMessage: null,
});

export const AgentMessagingProvider = ({
  children,
}: {
  children?: ComponentChildren;
}) => {
  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);

  return (
    <agentMessagingContext.Provider value={{ agentMessage, sendMessage }}>
      {children}
    </agentMessagingContext.Provider>
  );
};
