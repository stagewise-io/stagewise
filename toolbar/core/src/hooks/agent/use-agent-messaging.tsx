import { useState, useEffect, useContext } from 'preact/hooks';
import type {
  AgentMessageContentItemPart,
  UserMessage,
  AgentMessageUpdate,
} from '@stagewise/agent-interface/toolbar';
import { type ComponentChildren, createContext } from 'preact';
import { useAgent } from './use-agent-provider.tsx';

export type AgentMessage = {
  id: string;
  contentItems: AgentMessageContentItemPart[];
};

type MessagingContext = {
  /** Used to send messages to the configured agent */
  sendMessage: (message: UserMessage) => void;
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
  const agent = useAgent().connected;

  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);

  const handleMessageUpdate = (update: AgentMessageUpdate) => {
    setAgentMessage((prev) => {
      if (!prev || prev.id !== update.messageId || update.resync) {
        return {
          id: update.messageId,
          contentItems: update.updateParts
            .sort((a, b) => a.contentIndex - b.contentIndex)
            .map((part) => part.part),
        };
      } else {
        const newContentItems = prev.contentItems;

        for (const part of update.updateParts) {
          const updatedItem = newContentItems[part.contentIndex];
          if (updatedItem && part.part.type !== updatedItem.type) {
            throw new Error('Cannot update a part of a different type');
          }

          if (updatedItem && updatedItem.type === 'text') {
            // @ts-ignore Compiler is too stupid to understand that the type is correct
            updatedItem.text += part.part.text;
          } else if (
            updatedItem &&
            updatedItem.type === 'image' &&
            part.part.type === 'image'
          ) {
            if (updatedItem.replacing) {
              updatedItem.mimeType = part.part.mimeType;
              updatedItem.data = part.part.data;
            } else if (part.part.mimeType === updatedItem.mimeType) {
              updatedItem.data += part.part.data;
            } else {
              throw new Error(
                'Cannot update an image with a different mime type',
              );
            }
          }

          newContentItems[part.contentIndex] = updatedItem;
        }

        const newMessage: AgentMessage = {
          id: prev.id,
          contentItems: newContentItems,
        };

        console.log('New message', newMessage);

        return newMessage;
      }
    });
  };

  useEffect(() => {
    if (agent !== null) {
      agent.messaging.getMessage.subscribe(undefined, {
        onData: (value) => {
          handleMessageUpdate(value);
        },
        onError: () => {
          setAgentMessage(null);
        },
      });
    }
  }, [agent]);

  const handleUserMessage = (message: UserMessage) => {
    agent?.messaging.sendUserMessage.mutate(message);
  };

  return (
    <agentMessagingContext.Provider
      value={{ agentMessage, sendMessage: handleUserMessage }}
    >
      {children}
    </agentMessagingContext.Provider>
  );
};

export const useAgentMessaging = () => {
  return useContext(agentMessagingContext);
};
