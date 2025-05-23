// SPDX-License-Identifier: AGPL-3.0-only
// Toolbar chat state hook
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

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

      const chat = chats.find((chat) => chat.id === chatId);

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
          const result = await bridge.call.triggerAgentPrompt(
            { prompt, sessionId: selectedSession?.sessionId },
            { onUpdate: (update) => {} },
          );
        }
      }

      triggerAgentPrompt();

      setIsPromptCreationMode(false);

      if (chatAreaState === 'hidden') {
        internalSetChatAreaState('compact');
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                inputValue: '',
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
