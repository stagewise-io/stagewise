import { ComponentChildren, createContext } from "preact";
import {
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "preact/hooks";

type ChatChangeHandler = (chat: Chat) => void;

interface ChatInputHandle {
  setInputActive: (active: boolean) => void;
  setInputValue: (value: string) => void;
  onChatChange: (handler: ChatChangeHandler) => void;
  submitMessage: (content: string) => void;
}

interface Message {
  id: string;
  content: string;
  sender: "user" | "assistant";
  type: "regular" | "user_request";
  timestamp: Date;
}

type ChatId = string;

interface Chat {
  id: ChatId | "new_chat";
  name: string | null;
  messages: Message[];
  responseLoading: boolean;
  lastInput: string | null; // This stores the last value of the input field that was given by the user.
}

type ChatAreaState = "hidden" | "compact" | "expanded";

interface ChatContext {
  getChatInputHandle: () => ChatInputHandle;
  isInputActive: boolean;
  availableChats: Chat[];
  currentChatId: ChatId | "new_chat";
  setCurrentChatId: (chatId: ChatId) => void;
  closeChat: (chatId: ChatId) => void;
  setChatAreaState: (state: ChatAreaState) => void;
  chatAreaState: ChatAreaState;
}

const ChatContext = createContext<ChatContext>({
  getChatInputHandle: () => null,
  isInputActive: false,
  availableChats: [],
  currentChatId: null,
  setCurrentChatId: () => null,
  closeChat: () => null,
  setChatAreaState: () => null,
  chatAreaState: "hidden",
});

interface ChatServerSyncer {
  // Fetch all chats from the server
  fetchChats: () => Promise<Chat[]>;
  // Save a single chat to the server
  saveChat: (chat: Chat) => Promise<void>;
  // Delete a chat from the server
  deleteChat: (chatId: ChatId) => Promise<void>;
  // Subscribe to chat updates from the server
  subscribeToUpdates: (onUpdate: (chat: Chat) => void) => () => void;
}

interface ChatStateProviderProps {
  children: ComponentChildren;
  syncer: ChatServerSyncer;
}

export const ChatStateProvider = ({
  children,
  syncer,
}: ChatStateProviderProps) => {
  const [isInputActive, setIsInputActive] = useState(false);
  const [availableChats, setAvailableChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<ChatId | null>(null);
  const [chatAreaState, setChatAreaState] = useState<ChatAreaState>("expanded");
  const chatChangeHandlers = useRef<ChatChangeHandler[]>([]);

  // Initialize chats from server
  useEffect(() => {
    const loadChats = async () => {
      try {
        const chats = await syncer.fetchChats();
        setAvailableChats(chats);
      } catch (error) {
        console.error("Failed to load chats:", error);
      }
    };
    loadChats();
  }, [syncer]);

  // Subscribe to server updates
  useEffect(() => {
    const unsubscribe = syncer.subscribeToUpdates((updatedChat) => {
      setAvailableChats((prevChats) => {
        const existingChatIndex = prevChats.findIndex(
          (chat) => chat.id === updatedChat.id
        );
        if (existingChatIndex === -1) {
          return [...prevChats, updatedChat];
        }
        return prevChats.map((chat) =>
          chat.id === updatedChat.id ? updatedChat : chat
        );
      });
    });

    return () => unsubscribe();
  }, [syncer]);

  const getChatInputHandle = useCallback((): ChatInputHandle => {
    return {
      setInputActive: setIsInputActive,
      setInputValue: (value: string) => {
        setAvailableChats((prevChats) => {
          const currentChat = prevChats.find(
            (chat) => chat.id === currentChatId
          );
          if (!currentChat) return prevChats;

          const updatedChat = { ...currentChat, lastInput: value };
          // Save to server
          syncer.saveChat(updatedChat).catch((error) => {
            console.error("Failed to save chat:", error);
          });

          // If the chat area is hidden, automatically set it to compact
          if (chatAreaState === "hidden") {
            setChatAreaState("compact");
          }

          return prevChats.map((chat) =>
            chat.id === currentChatId ? updatedChat : chat
          );
        });
      },
      onChatChange: (handler: ChatChangeHandler) => {
        chatChangeHandlers.current.push(handler);
      },
      submitMessage: (content: string) => {
        if (!content.trim()) return;

        setAvailableChats((prevChats) => {
          const currentChat = prevChats.find(
            (chat) => chat.id === currentChatId
          );
          if (!currentChat) return prevChats;

          const newMessage: Message = {
            id: crypto.randomUUID(),
            content: content.trim(),
            sender: "user",
            type: "regular",
            timestamp: new Date(),
          };

          const updatedChat = {
            ...currentChat,
            messages: [...currentChat.messages, newMessage],
            lastInput: "",
          };

          // Save to server
          syncer.saveChat(updatedChat).catch((error) => {
            console.error("Failed to save chat:", error);
          });

          // If the chat area is hidden, automatically set it to compact
          if (chatAreaState === "hidden") {
            setChatAreaState("compact");
          }

          return prevChats.map((chat) =>
            chat.id === currentChatId ? updatedChat : chat
          );
        });
      },
    };
  }, [currentChatId, syncer, chatAreaState]);

  const handleSetCurrentChatId = useCallback(
    (chatId: ChatId) => {
      setCurrentChatId(chatId);
      const chat = availableChats.find((c) => c.id === chatId);
      if (chat) {
        chatChangeHandlers.current.forEach((handler) => handler(chat));
      }
    },
    [availableChats]
  );

  const closeChat = useCallback(
    (chatId: ChatId) => {
      // Delete from server first
      syncer.deleteChat(chatId).catch((error) => {
        console.error("Failed to delete chat:", error);
      });

      setAvailableChats((prevChats) =>
        prevChats.filter((chat) => chat.id !== chatId)
      );

      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    },
    [currentChatId, syncer]
  );

  const value: ChatContext = {
    getChatInputHandle,
    isInputActive,
    availableChats,
    currentChatId,
    setCurrentChatId: handleSetCurrentChatId,
    closeChat,
    setChatAreaState,
    chatAreaState,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

export function useChatState() {
  const context = useContext(ChatContext);
  return context;
}
