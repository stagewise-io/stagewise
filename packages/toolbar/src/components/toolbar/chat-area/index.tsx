/** The chat area is the top section of the toolbar that can either be hidden or expanded, based on the likings and the ations of the user. */

import { useChatState } from "@/hooks/use-chat-state";
import { Plus } from "lucide-react";
import { Button } from "@headlessui/react";
import { ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { ComponentChildren } from "preact";
import { memo, useCallback } from "preact/compat";
import { cn } from "@/utils";

export const ChatArea = memo(() => {
  const { chatAreaState } = useChatState();

  if (chatAreaState === "hidden") return null;

  return (
    <ChatAreaBox>
      <ChatAreaResizeBar />
      {chatAreaState === "compact" && <ChatAreaCompact />}
      {chatAreaState === "expanded" && <ChatAreaExpanded />}
    </ChatAreaBox>
  );
});

const ChatAreaBox = memo(({ children }: { children: ComponentChildren }) => (
  <div className="w-full h-auto overflow-x-hidden">{children}</div>
));

const ChatAreaResizeBar = memo(() => {
  const { chatAreaState, setChatAreaState } = useChatState();

  const handleResizeBarClick = useCallback(() => {
    setChatAreaState(chatAreaState === "compact" ? "expanded" : "compact");
  }, [chatAreaState, setChatAreaState]);

  const handleCloseChatArea = useCallback(() => {
    setChatAreaState("hidden");
  }, [setChatAreaState]);

  return (
    <div className="w-full py-1 px-3 rounded-t-3xl bg-zinc-500/5 flex flex-row justify-between items-center">
      <div className="size-5" />
      <Button
        className="bg-transparent text-muted-foreground/30 hover:text-muted-foreground size-5 transition-colors duration-100"
        onClick={handleResizeBarClick}
      >
        {chatAreaState === "compact" ? (
          <ChevronUp className="size-5" />
        ) : (
          <ChevronDown className="size-5" />
        )}
      </Button>
      <Button
        className="size-5 bg-transparent text-muted-foreground/30 hover:text-muted-foreground transition-colors duration-100"
        onClick={handleCloseChatArea}
      >
        <XCircle className="size-3" />
      </Button>
    </div>
  );
});

const ChatAreaCompact = memo(() => (
  <div className="w-full flex flex-col gap-1 p-3">
    <span className="text-sm text-zinc-950/50">
      This is the compact chat area... Showing just the last response from the
      assistant.
    </span>
  </div>
));

const ChatAreaExpanded = memo(() => {
  const { chats, currentChatId, setCurrentChat, createChat } = useChatState();
  const currentChat = chats.find((chat) => chat.id === currentChatId);
  const hasNewChat = chats.some((chat) => chat.id === "new_chat");

  const handleCreateChat = useCallback(() => {
    createChat();
  }, [createChat]);

  const handleSetCurrentChat = useCallback(
    (chatId: string) => {
      setCurrentChat(chatId);
    },
    [setCurrentChat]
  );

  return (
    <div className="w-full flex flex-col gap-3 p-3 pb-0 max-h-[50vh]">
      <div className="flex flex-col gap-2 flex-1 overflow-y-auto p-1">
        {currentChat?.messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.sender === "assistant" ? "justify-start" : "justify-end"
            }`}
          >
            <div
              className={`max-w-[80%] px-2 py-1 rounded-xl text-sm ${
                message.sender === "assistant"
                  ? "bg-zinc-950/5 text-zinc-950"
                  : "bg-blue-600 text-white"
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-row gap-2 items-center justify-start overflow-x-auto overflow-y-visible pb-2 pt-2 border-t border-border/10">
        {!hasNewChat && (
          <Button
            className="text-xs px-2 h-6 rounded-full bg-zinc-950/5 text-foreground font-semibold flex-shrink-0"
            onClick={handleCreateChat}
          >
            <Plus className="size-3" />
          </Button>
        )}
        {chats.map((chat) => (
          <Button
            key={chat.id}
            className={cn(
              "text-xs px-2 h-5 rounded-full bg-zinc-950/5 text-muted-foreground flex-shrink-0 max-w-48 overflow-hidden truncate",
              chat.id === currentChatId &&
                "bg-white/60 text-zinc-950 shadow-sm shadow-blue-600/50"
            )}
            onClick={() => handleSetCurrentChat(chat.id)}
          >
            {chat.title || "New chat"}
          </Button>
        ))}
      </div>
    </div>
  );
});
