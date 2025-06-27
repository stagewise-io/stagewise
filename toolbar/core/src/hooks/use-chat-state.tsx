import { type ComponentChildren, createContext } from 'preact';
import { useContext, useState, useCallback, useEffect } from 'preact/hooks';
import { useAppState } from './use-app-state';
import { usePlugins } from './use-plugins';
import {
  generateId,
  getSelectedElementInfo,
  collectUserMessageMetadata,
} from '@/utils';
import { useAgentMessaging } from './agent/use-agent-messaging';
import type {
  UserMessage,
  UserMessageContentItem,
} from '@stagewise/agent-interface/toolbar';

interface ContextSnippet {
  promptContextName: string;
  content: (() => string | Promise<string>) | string;
}
interface PluginContextSnippets {
  pluginName: string;
  contextSnippets: ContextSnippet[];
}
[];

interface ChatContext {
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

  // Prompt state
  promptState: 'idle' | 'loading' | 'error' | 'success';
}

const ChatContext = createContext<ChatContext>({
  chatInput: '',
  setChatInput: () => {},
  domContextElements: [],
  addChatDomContext: () => {},
  removeChatDomContext: () => {},
  sendMessage: () => {},
  isPromptCreationActive: false,
  startPromptCreation: () => {},
  stopPromptCreation: () => {},
  promptState: 'idle',
});

interface ChatStateProviderProps {
  children: ComponentChildren;
}

export const ChatStateProvider = ({ children }: ChatStateProviderProps) => {
  const [chatInput, setChatInput] = useState<string>('');
  const [isPromptCreationMode, setIsPromptCreationMode] =
    useState<boolean>(false);
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
  const { sendMessage: sendAgentMessage } = useAgentMessaging();

  useEffect(() => {
    if (minimized) {
      setIsPromptCreationMode(false);
    }
  }, [minimized]);

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

    const pluginProcessingPromises = plugins.map(async (plugin) => {
      const userMessagePayload = {
        id: generateId(),
        text: chatInput,
        contextElements: domContextElements.map((el) => el.element),
        sentByPlugin: false,
      };

      const handlerResult = await plugin.onPromptSend?.(userMessagePayload);

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
        const pluginSnippets: PluginContextSnippets = {
          pluginName: plugin.pluginName,
          contextSnippets: resolvedSnippets,
        };
        return pluginSnippets;
      }
      return null;
    });

    const allPluginContexts = await Promise.all(pluginProcessingPromises);

    const pluginContent: Record<string, UserMessageContentItem[]> = {};
    allPluginContexts.forEach((context) => {
      pluginContent[context.pluginName] = context.contextSnippets.map(
        (snippet) => ({
          type: 'text',
          text: `# ${snippet.promptContextName}\n\n${snippet.content}`,
        }),
      );
    });

    const userMessageInput: UserMessage = {
      id: generateId(),
      createdAt: new Date(),
      contentItems: [
        {
          type: 'text',
          text: chatInput,
        },
      ],
      metadata: collectUserMessageMetadata(
        domContextElements.map((item) => getSelectedElementInfo(item.element)),
      ),
      pluginContent,
      sentByPlugin: false,
    };

    sendAgentMessage(userMessageInput);

    // Reset state after sending
    setChatInput('');
    setDomContextElements([]);
    setIsPromptCreationMode(false);
  }, [chatInput, domContextElements, plugins, sendAgentMessage]);

  const value: ChatContext = {
    chatInput,
    setChatInput,
    domContextElements,
    addChatDomContext,
    removeChatDomContext,
    sendMessage,
    isPromptCreationActive: isPromptCreationMode,
    startPromptCreation,
    stopPromptCreation,
    promptState: 'idle',
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export function useChatState() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
}
