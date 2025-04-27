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

  // UI state
  chatAreaState: ChatAreaState;
  setChatAreaState: (state: ChatAreaState) => void;
  inputFocus: boolean;
  setInputFocus: (focus: boolean) => void;
}

const ChatContext = createContext<ChatContext>({
  chats: [],
  currentChatId: null,
  createChat: () => "",
  deleteChat: () => {},
  setCurrentChat: () => {},
  setChatInput: () => {},
  addMessage: () => {},
  chatAreaState: "hidden",
  setChatAreaState: () => {},
  inputFocus: false,
  setInputFocus: () => {},
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
    },
  ]);
  const [currentChatId, setCurrentChatId] = useState<ChatId>("new_chat");
  const [chatAreaState, setChatAreaState] = useState<ChatAreaState>("hidden");
  const [inputFocus, setInputFocus] = useState<boolean>(false);

  const createChat = useCallback(() => {
    const newChatId = crypto.randomUUID();
    const newChat: Chat = {
      id: newChatId,
      title: null,
      messages: [],
      inputValue: "",
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
        setChatAreaState("compact");
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, newMessage],
                inputValue: "",
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
    inputFocus,
    setInputFocus,
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
