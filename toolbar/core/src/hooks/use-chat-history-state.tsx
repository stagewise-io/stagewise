import { type ReactNode, createContext } from 'react';
import { useContext, useState, useCallback, useEffect } from 'react';
import { useAppState } from './use-app-state';
import { usePlugins } from './use-plugins';
import {
  generateId,
  getSelectedElementInfo,
  collectUserMessageMetadata,
} from '@/utils';
import { useAgentChat } from './agent/chat/use-agent-chat';
import { useAgentState } from './agent/use-agent-state';
import type {
  TextPart,
  FilePart,
  UserMessageMetadata,
  PluginContentItem,
} from '@stagewise/agent-interface/toolbar';
import { AgentStateType } from '@stagewise/agent-interface/toolbar';
import { usePanels } from './use-panels';

interface ContextSnippet {
  promptContextName: string;
  content: (() => string | Promise<string>) | string;
}

export type PluginContextSnippets = {
  pluginName: string;
  contextSnippets: ContextSnippet[];
};

interface ChatHistoryContext {
  // Chat content operations
  chatInput: string;
  setChatInput: (value: string) => void;
  domContextElements: {
    element: HTMLElement;
    pluginContext: {
      pluginName: string;
      context: any;
    }[];
  }[];
  addChatDomContext: (element: HTMLElement) => void;
  removeChatDomContext: (element: HTMLElement) => void;
  sendMessage: () => void;

  // UI state
  isPromptCreationActive: boolean;
  startPromptCreation: () => void;
  stopPromptCreation: () => void;
  isSending: boolean;
}

const ChatHistoryContext = createContext<ChatHistoryContext>({
  chatInput: '',
  setChatInput: () => {},
  domContextElements: [],
  addChatDomContext: () => {},
  removeChatDomContext: () => {},
  sendMessage: () => {},
  isPromptCreationActive: false,
  startPromptCreation: () => {},
  stopPromptCreation: () => {},
  isSending: false,
});

interface ChatHistoryStateProviderProps {
  children: ReactNode;
}

export const ChatHistoryStateProvider = ({
  children,
}: ChatHistoryStateProviderProps) => {
  const [chatInput, setChatInput] = useState<string>('');
  const [isPromptCreationMode, setIsPromptCreationMode] =
    useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [domContextElements, setDomContextElements] = useState<
    {
      element: HTMLElement;
      pluginContext: {
        pluginName: string;
        context: any;
      }[];
    }[]
  >([]);

  const { minimized } = useAppState();
  const { plugins } = usePlugins();
  const { sendMessage: sendChatMessage } = useAgentChat();
  const { isChatOpen } = usePanels();
  const agentState = useAgentState();

  const startPromptCreation = useCallback(() => {
    setIsPromptCreationMode(true);
    plugins.forEach((plugin) => {
      plugin.onPromptingStart?.();
    });
  }, [plugins]);

  const stopPromptCreation = useCallback(() => {
    setIsPromptCreationMode(false);
    setDomContextElements([]);
    plugins.forEach((plugin) => {
      plugin.onPromptingAbort?.();
    });
  }, [plugins]);

  useEffect(() => {
    if (!isChatOpen) {
      stopPromptCreation();
    }
  }, [isChatOpen, stopPromptCreation]);

  useEffect(() => {
    if (minimized) {
      stopPromptCreation();
    }
  }, [minimized]);

  // Auto-stop prompt creation when agent is busy
  useEffect(() => {
    const allowedStates = [
      AgentStateType.IDLE,
      AgentStateType.WAITING_FOR_USER_RESPONSE,
    ];

    if (
      isPromptCreationMode &&
      agentState.state &&
      !allowedStates.includes(agentState.state)
    ) {
      stopPromptCreation();
    }
  }, [agentState.state, isPromptCreationMode, stopPromptCreation]);

  const addChatDomContext = useCallback(
    (element: HTMLElement) => {
      const pluginsWithContextGetters = plugins.filter(
        (plugin) => plugin.onContextElementSelect,
      );

      setDomContextElements((prev) => [
        ...prev,
        {
          element,
          pluginContext: pluginsWithContextGetters.map((plugin) => ({
            pluginName: plugin.pluginName,
            context: plugin.onContextElementSelect?.(element),
          })),
        },
      ]);
    },
    [plugins],
  );

  const removeChatDomContext = useCallback((element: HTMLElement) => {
    setDomContextElements((prev) =>
      prev.filter((item) => item.element !== element),
    );
  }, []);

  const sendMessage = useCallback(async () => {
    if (!chatInput.trim()) return;

    setIsSending(true);

    try {
      // Collect metadata for selected elements
      const metadata = collectUserMessageMetadata(
        domContextElements.map((item) => getSelectedElementInfo(item.element)),
      );

      // Process plugin content for both old and new format
      const pluginProcessingPromises = plugins.map(async (plugin) => {
        const baseMessage = {
          id: generateId(),
          createdAt: new Date(),
          contentItems: [{ type: 'text' as const, text: chatInput }],
          metadata,
          pluginContent: {},
          sentByPlugin: false,
        };

        const handlerResult = await plugin.onPromptSend?.(baseMessage);

        if (
          !handlerResult ||
          !handlerResult.contextSnippets ||
          handlerResult.contextSnippets.length === 0
        ) {
          return null;
        }

        const snippetPromises = handlerResult.contextSnippets.map(
          async (snippet) => {
            const resolvedContent =
              typeof snippet.content === 'string'
                ? snippet.content
                : await snippet.content();
            return {
              promptContextName: snippet.promptContextName,
              content: resolvedContent,
            };
          },
        );

        const resolvedSnippets = await Promise.all(snippetPromises);

        if (resolvedSnippets.length > 0) {
          return {
            pluginName: plugin.pluginName,
            contextSnippets: resolvedSnippets,
          };
        }
        return null;
      });

      const allPluginContexts = await Promise.all(pluginProcessingPromises);

      // Build pluginContentItems for metadata
      const pluginContentItems: UserMessageMetadata['pluginContentItems'] = {};

      // Build content array for the chat message
      const content: (TextPart | FilePart)[] = [
        {
          type: 'text',
          text: chatInput,
        },
      ];

      // Add plugin content as additional text parts if needed
      allPluginContexts.forEach((context) => {
        if (!context) return;

        // Add to pluginContentItems in metadata
        pluginContentItems[context.pluginName] = {};

        context.contextSnippets.forEach((snippet) => {
          const contentItem: PluginContentItem = {
            type: 'text',
            text: snippet.content,
          };
          pluginContentItems[context.pluginName][snippet.promptContextName] =
            contentItem;

          // Optionally add as a text part in the message content
          // This ensures the plugin content is visible in the chat
          content.push({
            type: 'text',
            text: `[${context.pluginName}:${snippet.promptContextName}]\n${snippet.content}`,
          });
        });
      });

      // Update metadata with pluginContentItems
      const enrichedMetadata: UserMessageMetadata = {
        ...metadata,
        pluginContentItems:
          Object.keys(pluginContentItems).length > 0
            ? pluginContentItems
            : undefined,
      };

      // Send the message using the chat capability
      await sendChatMessage(content, enrichedMetadata);

      // Reset state after sending
      setChatInput('');
      setDomContextElements([]);
      setIsPromptCreationMode(false);
    } finally {
      setIsSending(false);
    }
  }, [chatInput, domContextElements, plugins, sendChatMessage]);

  const value: ChatHistoryContext = {
    chatInput,
    setChatInput,
    domContextElements,
    addChatDomContext,
    removeChatDomContext,
    sendMessage,
    isPromptCreationActive: isPromptCreationMode,
    startPromptCreation,
    stopPromptCreation,
    isSending,
  };

  return (
    <ChatHistoryContext.Provider value={value}>
      {children}
    </ChatHistoryContext.Provider>
  );
};

export function useChatHistoryState() {
  const context = useContext(ChatHistoryContext);
  if (!context) {
    throw new Error(
      'useChatHistoryState must be used within a ChatHistoryStateProvider',
    );
  }
  return context;
}
