import {
  useState,
  useEffect,
  useContext,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import type {
  AgentMessageContentItemPart,
  UserMessage,
  AgentMessageUpdate,
} from '@stagewise/agent-interface/toolbar';
import { type ReactNode, createContext } from 'react';
import { useAgents } from './use-agent-provider.js';

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
  children?: ReactNode;
}) => {
  const providerId = useMemo(() => Math.random().toString(36).substr(2, 9), []);

  const agent = useAgents().connected;

  const [agentMessage, setAgentMessage] = useState<AgentMessage | null>(null);
  const processedUpdatesRef = useRef<Set<string>>(new Set());

  const handleMessageUpdate = useCallback(
    (update: AgentMessageUpdate) => {
      // Create a unique key for this update to prevent double processing
      const updateKey = `${update.messageId}-${update.createdAt?.getTime()}-${update.resync}`;

      if (processedUpdatesRef.current.has(updateKey)) {
        return;
      }

      processedUpdatesRef.current.add(updateKey);

      // Clean up old processed updates to prevent memory leaks (keep last 100)
      if (processedUpdatesRef.current.size > 100) {
        const entries = Array.from(processedUpdatesRef.current);
        processedUpdatesRef.current = new Set(entries.slice(-50));
      }

      setAgentMessage((prev) => {
        if (!prev || prev.id !== update.messageId || update.resync) {
          const newMessage = {
            id: update.messageId,
            contentItems: update.updateParts
              .sort((a, b) => a.contentIndex - b.contentIndex)
              .map((part) => part.part),
          };
          return newMessage;
        } else {
          const newContentItems = [...prev.contentItems];

          for (const part of update.updateParts) {
            const existingItem = newContentItems[part.contentIndex];
            if (existingItem && part.part.type !== existingItem.type) {
              throw new Error('Cannot update a part of a different type');
            }

            if (
              existingItem &&
              existingItem.type === 'text' &&
              part.part.type === 'text'
            ) {
              // Create a copy of the text item and append the new text
              const updatedItem = {
                ...existingItem,
                text: existingItem.text + part.part.text,
              };
              newContentItems[part.contentIndex] = updatedItem;
            } else if (
              existingItem &&
              existingItem.type === 'image' &&
              part.part.type === 'image'
            ) {
              let updatedItem: AgentMessageContentItemPart;
              if (existingItem.data && part.part.data) {
                updatedItem = {
                  ...existingItem,
                  data: existingItem.data + part.part.data,
                };
              } else {
                updatedItem = part.part;
              }
              newContentItems[part.contentIndex] = updatedItem;
            } else {
              newContentItems[part.contentIndex] = part.part;
            }
          }

          const updatedMessage = {
            id: update.messageId,
            contentItems: newContentItems,
          };
          return updatedMessage;
        }
      });
    },
    [providerId],
  );

  useEffect(() => {
    if (agent) {
      const subscription = agent.agent.messaging.getMessage.subscribe(
        undefined,
        {
          onData: (value) => {
            // Double-check that agent is still available when data arrives
            handleMessageUpdate(value);
          },
          onError: () => {
            setAgentMessage(null);
          },
        },
      );

      // Cleanup function to unsubscribe when agent changes or component unmounts
      return () => {
        try {
          subscription.unsubscribe();
        } catch (error) {
          console.debug(
            '[AgentMessagingProvider] Error unsubscribing from messaging:',
            error,
          );
        }
      };
    } else {
      setAgentMessage(null);
    }
  }, [agent, handleMessageUpdate]);

  const handleUserMessage = (message: UserMessage) => {
    agent?.agent.messaging.sendUserMessage.mutate(message);
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
