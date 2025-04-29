import { ComponentChildren, createContext } from "preact";
import { useContext, useState, useCallback, useEffect } from "preact/hooks";

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  type: "regular" | "user_request";
  timestamp: Date;
}

type ChatId = string;

interface Chat {
  id: ChatId;
  title: string | null;
  messages: Message[];
  inputValue: string;
  domContextElements: HTMLElement[];
}

type ChatAreaState = "hidden" | "compact" | "expanded";

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
  createChat: () => "",
  deleteChat: () => {},
  setCurrentChat: () => {},
  setChatInput: () => {},
  addChatDomContext: () => {},
  removeChatDomContext: () => {},
  addMessage: () => {},
  chatAreaState: "hidden",
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
      id: "new_chat",
      messages: [],
      title: "New chat",
      inputValue: "",
      domContextElements: [],
    },
  ]);
  const [currentChatId, setCurrentChatId] = useState<ChatId>("new_chat");
  const [chatAreaState, internalSetChatAreaState] =
    useState<ChatAreaState>("hidden");
  const [isPromptCreationMode, setIsPromptCreationMode] =
    useState<boolean>(false);

  const createChat = useCallback(() => {
    const newChatId = crypto.randomUUID();
    const newChat: Chat = {
      id: newChatId,
      title: null,
      messages: [],
      inputValue: "",
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
              id: "new_chat",
              messages: [],
              title: "New chat",
              inputValue: "",
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
    [currentChatId]
  );

  const setCurrentChat = useCallback((chatId: ChatId) => {
    setCurrentChatId(chatId);
  }, []);

  const setChatInput = useCallback((chatId: ChatId, value: string) => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === chatId ? { ...chat, inputValue: value } : chat
      )
    );
  }, []);

  const setChatAreaState = useCallback(
    (state: ChatAreaState) => {
      internalSetChatAreaState(state);
    },
    [internalSetChatAreaState]
  );

  const startPromptCreation = useCallback(() => {
    setIsPromptCreationMode(true);
    if (chatAreaState === "hidden") {
      internalSetChatAreaState("compact");
    }
  }, [chatAreaState]);

  const stopPromptCreation = useCallback(() => {
    setIsPromptCreationMode(false);
    // clear dom context for this chat so that it doesn't get too weird when re-starting prompt creation mode
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === currentChatId ? { ...chat, domContextElements: [] } : chat
      )
    );
  }, [currentChatId]);

  const addChatDomContext = useCallback(
    (chatId: ChatId, element: HTMLElement) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                domContextElements: [...chat.domContextElements, element],
              }
            : chat
        )
      );
    },
    []
  );

  const removeChatDomContext = useCallback(
    (chatId: ChatId, element: HTMLElement) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                domContextElements: chat.domContextElements.filter(
                  (e) => e !== element
                ),
              }
            : chat
        )
      );
    },
    []
  );

  const addMessage = useCallback(
    (chatId: ChatId, content: string) => {
      if (!content.trim()) return;

      const newMessage: Message = {
        id: crypto.randomUUID(),
        content: content.trim(),
        sender: "user",
        type: "regular",
        timestamp: new Date(),
      };

      if (chatAreaState === "hidden") {
        internalSetChatAreaState("compact");
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                inputValue: "",
                domContextElements: [],
              }
            : chat
        )
      );
    },
    [chatAreaState]
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
    throw new Error("useChatState must be used within a ChatStateProvider");
  }
  return context;
}
