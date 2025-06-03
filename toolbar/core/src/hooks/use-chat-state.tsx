import { type ComponentChildren, createContext } from 'preact';
import { useContext, useState, useCallback, useEffect } from 'preact/hooks';
import { useSRPCBridge } from './use-srpc-bridge';
import { createPrompt, type PluginContextSnippets } from '@/prompts';
import { useAppState } from './use-app-state';
import { usePlugins } from './use-plugins';
import type { ContextElementContext } from '@/plugin';
import { useVSCode } from './use-vscode';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  type: 'regular' | 'user_request';
  timestamp: Date;
}

type ChatId = string;

interface Chat {
  id: ChatId;
  title: string | null;
  messages: Message[];
  inputValue: string;
  domContextElements: {
    element: HTMLElement;
    pluginContext: {
      pluginName: string;
      context: ContextElementContext;
    }[];
  }[];
}

type ChatAreaState = 'hidden' | 'compact' | 'expanded';

// Add new prompt state type
type PromptState = 'idle' | 'loading' | 'success' | 'error';

interface ChatContext {
  // Chat list management
  chats: Chat[];
  currentChatId: ChatId | null;

  // Chat operations
  createChat: () => ChatId;
  deleteChat: (chatId: ChatId) => void;
  setCurrentChat: (chatId: ChatId) => void;

  // Chat content operations
  setChatInput: (chatId: ChatId, value: string) => void;
  addMessage: (chatId: ChatId, content: string) => void;
  addChatDomContext: (chatId: ChatId, element: HTMLElement) => void;
  removeChatDomContext: (chatId: ChatId, element: HTMLElement) => void;

  // UI state
  chatAreaState: ChatAreaState;
  setChatAreaState: (state: ChatAreaState) => void;
  isPromptCreationActive: boolean;
  startPromptCreation: () => void;
  stopPromptCreation: () => void;

  // Prompt state
  promptState: PromptState;
  resetPromptState: () => void;
}

const ChatContext = createContext<ChatContext>({
  chats: [],
  currentChatId: null,
  createChat: () => '',
  deleteChat: () => {},
  setCurrentChat: () => {},
  setChatInput: () => {},
  addChatDomContext: () => {},
  removeChatDomContext: () => {},
  addMessage: () => {},
  chatAreaState: 'hidden',
  setChatAreaState: () => {},
  isPromptCreationActive: false,
  startPromptCreation: () => {},
  stopPromptCreation: () => {},
  promptState: 'idle',
  resetPromptState: () => {},
});

interface ChatStateProviderProps {
  children: ComponentChildren;
}

export const ChatStateProvider = ({ children }: ChatStateProviderProps) => {
  const [chats, setChats] = useState<Chat[]>([
    {
      id: 'new_chat',
      messages: [],
      title: 'New chat',
      inputValue: '',
      domContextElements: [],
    },
  ]);
  const [currentChatId, setCurrentChatId] = useState<ChatId>('new_chat');
  const [chatAreaState, internalSetChatAreaState] =
    useState<ChatAreaState>('hidden');
  const [isPromptCreationMode, setIsPromptCreationMode] =
    useState<boolean>(false);

  // Add prompt state management
  const [promptState, setPromptState] = useState<PromptState>('idle');

  // Reset prompt state function
  const resetPromptState = useCallback(() => {
    setPromptState('idle');
  }, []);

  const isMinimized = useAppState((state) => state.minimized);

  const { selectedSession } = useVSCode();

  useEffect(() => {
    if (isMinimized) {
      setIsPromptCreationMode(false);
      internalSetChatAreaState('hidden');
    }
  }, [isMinimized]);

  const { bridge } = useSRPCBridge();

  const createChat = useCallback(() => {
    const newChatId = crypto.randomUUID();
    const newChat: Chat = {
      id: newChatId,
      title: null,
      messages: [],
      inputValue: '',
      domContextElements: [],
    };
    setChats((prev) => [...prev, newChat]);
    setCurrentChatId(newChatId);
    return newChatId;
  }, []);

  const deleteChat = useCallback(
    (chatId: ChatId) => {
      setChats((prev) => {
        const filteredChats = prev.filter((chat) => chat.id !== chatId);
        if (filteredChats.length === 0) {
          return [
            {
              id: 'new_chat',
              messages: [],
              title: 'New chat',
              inputValue: '',
              domContextElements: [],
            },
          ];
        }
        return filteredChats;
      });
      if (currentChatId === chatId) {
        setChats((prev) => {
          setCurrentChatId(prev[0].id);
          return prev;
        });
      }
    },
    [currentChatId],
  );

  const setCurrentChat = useCallback((chatId: ChatId) => {
    setCurrentChatId(chatId);
  }, []);

  const setChatInput = useCallback((chatId: ChatId, value: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, inputValue: value } : chat,
      ),
    );
  }, []);

  const { plugins } = usePlugins();

  const startPromptCreation = useCallback(() => {
    setIsPromptCreationMode(true);
    if (chatAreaState === 'hidden') {
      internalSetChatAreaState('compact');
    }

    plugins.forEach((plugin) => {
      plugin.onPromptingStart?.();
    });
  }, [chatAreaState]);

  const stopPromptCreation = useCallback(() => {
    setIsPromptCreationMode(false);
    // Reset prompt state when stopping prompt creation
    setPromptState('idle');
    // clear dom context for this chat so that it doesn't get too weird when re-starting prompt creation mode
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId ? { ...chat, domContextElements: [] } : chat,
      ),
    );
    if (chatAreaState === 'compact') {
      internalSetChatAreaState('hidden');
    }

    plugins.forEach((plugin) => {
      plugin.onPromptingAbort?.();
    });
  }, [currentChatId, chatAreaState]);

  const setChatAreaState = useCallback(
    (state: ChatAreaState) => {
      internalSetChatAreaState(state);
      if (state === 'hidden') {
        stopPromptCreation();
      }
    },
    [internalSetChatAreaState, stopPromptCreation],
  );

  const addChatDomContext = useCallback(
    (chatId: ChatId, element: HTMLElement) => {
      const pluginsWithContextGetters = plugins.filter(
        (plugin) => plugin.onContextElementSelect,
      );

      setChats((prev) =>
        prev.map((chat) => {
          return chat.id === chatId
            ? {
                ...chat,
                domContextElements: [
                  ...chat.domContextElements,
                  {
                    element,
                    pluginContext: pluginsWithContextGetters.map((plugin) => ({
                      pluginName: plugin.pluginName,
                      context: plugin.onContextElementSelect?.(element),
                    })),
                  },
                ],
              }
            : chat;
        }),
      );
    },
    [plugins],
  );

  const removeChatDomContext = useCallback(
    (chatId: ChatId, element: HTMLElement) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                domContextElements: chat.domContextElements.filter(
                  (e) => e.element !== element,
                ),
              }
            : chat,
        ),
      );
    },
    [],
  );

  const addMessage = useCallback(
    async (chatId: ChatId, content: string, pluginTriggered = false) => {
      if (!content.trim()) return;

      // Prevent sending new messages while one is already loading
      if (promptState === 'loading') return;

      const chat = chats.find((chat) => chat.id === chatId);

      // Set loading state at the start
      setPromptState('loading');

      const pluginContextSnippets: PluginContextSnippets[] = [];

      const pluginProcessingPromises = plugins.map(async (plugin) => {
        const userMessagePayload = {
          id: crypto.randomUUID(),
          text: content,
          contextElements:
            chat?.domContextElements.map((el) => el.element) || [],
          sentByPlugin: pluginTriggered,
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

      allPluginContexts.forEach((pluginCtx) => {
        if (pluginCtx) {
          pluginContextSnippets.push(pluginCtx);
        }
      });

      const prompt = createPrompt(
        chat?.domContextElements.map((e) => e.element),
        content,
        window.location.href,
        pluginContextSnippets,
      );

      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: content.trim(),
        sender: 'user',
        type: 'regular',
        timestamp: new Date(),
      };

      async function triggerAgentPrompt() {
        if (bridge) {
          try {
            const result = await bridge.call.triggerAgentPrompt(
              { prompt, sessionId: selectedSession?.sessionId },
              { onUpdate: (update) => {} },
            );

            // Handle response based on success/error
            if (result.result.success) {
              // On success, show success state briefly then reset
              setTimeout(() => {
                setPromptState('success');
              }, 1000);
              setChats((prev) =>
                prev.map((chat) =>
                  chat.id === chatId ? { ...chat, inputValue: '' } : chat,
                ),
              );
            } else {
              // On error, go to error state
              setPromptState('error');
              // Auto-reset to idle and close prompt creation after error animation
              setTimeout(() => {
                setPromptState('idle');
                setIsPromptCreationMode(false);
                // Clear input after error completion
                setChats((prev) =>
                  prev.map((chat) =>
                    chat.id === chatId ? { ...chat, inputValue: '' } : chat,
                  ),
                );
              }, 1000);
            }
          } catch (error) {
            // On exception, go to error state
            setPromptState('error');
            // Auto-reset to idle and close prompt creation after error animation
            setTimeout(() => {
              setPromptState('idle');
              setIsPromptCreationMode(false);
              // Clear input after error completion
              setChats((prev) =>
                prev.map((chat) =>
                  chat.id === chatId ? { ...chat, inputValue: '' } : chat,
                ),
              );
            }, 1000);
          }
        } else {
          // No bridge available, go to error state
          setPromptState('error');
          setTimeout(() => {
            setPromptState('idle');
            setIsPromptCreationMode(false);
            // Clear input after error completion
            setChats((prev) =>
              prev.map((chat) =>
                chat.id === chatId ? { ...chat, inputValue: '' } : chat,
              ),
            );
          }, 1000);
        }
      }

      triggerAgentPrompt();

      // Don't close prompt creation mode immediately - keep it open to show loading state

      if (chatAreaState === 'hidden') {
        internalSetChatAreaState('compact');
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                inputValue: content.trim(), // Keep the original prompt instead of clearing
                domContextElements: [],
              }
            : chat,
        ),
      );
    },
    [
      chatAreaState,
      bridge,
      chats,
      setIsPromptCreationMode,
      internalSetChatAreaState,
      selectedSession,
      promptState,
      setPromptState,
      plugins,
    ],
  );

  const value: ChatContext = {
    chats,
    currentChatId,
    createChat,
    deleteChat,
    setCurrentChat,
    setChatInput,
    addMessage,
    chatAreaState,
    setChatAreaState,
    isPromptCreationActive: isPromptCreationMode,
    startPromptCreation,
    stopPromptCreation,
    addChatDomContext,
    removeChatDomContext,
    promptState,
    resetPromptState,
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
