import { useChatState } from "@/hooks/use-chat-state";
import { cn } from "@/utils";
import { Button, Textarea } from "@headlessui/react";
import { Send } from "lucide-react";
import { useMemo } from "preact/hooks";

export function ChatBox() {
  const chatState = useChatState();
  const chatHandle = chatState.getChatInputHandle();
  const currentChat = chatState.availableChats.find(
    (c) => c.id === chatState.currentChatId
  );
  const currentInput = currentChat?.lastInput || "";
  const showBigBox = useMemo(() => {
    return currentInput.split("\n").length > 1 || currentInput.length > 48;
  }, [currentInput]);

  return (
    <div className="w-80 h-fit rounded-2xl focus-within:shadow-sm shadow-blue-600/100">
      <div className="flex-1 w-80 h-fit flex flex-row gap-1 p-1.5 rounded-2xl border border-border/10 bg-zinc-950/5 shadow-inner items-end text-sm placeholder:text-zinc-950/50 text-zinc-950">
        <Textarea
          className={cn(
            "w-full flex-1 resize-none focus:outline-none",
            showBigBox ? "h-[4.5em]" : "h-6"
          )}
          rows={showBigBox ? 4 : 1}
          value={currentInput}
          onChange={(e) => chatHandle.setInputValue(e.currentTarget.value)}
          placeholder="What do you want to change?"
        />
        <Button
          className={cn(
            "size-6 bg-transparent text-zinc-950 opacity-20 rounded-full p-1",
            currentInput.length > 0 && "opacity-100 text-white bg-blue-600"
          )}
          disabled={currentInput.length === 0}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
