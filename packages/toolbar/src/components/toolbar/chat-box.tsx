import { useChatState } from "@/hooks/use-chat-state";
import { useHotkeyListenerComboText } from "@/hooks/use-hotkey-listener-combo-text";
import { cn, hotkeyActionDefinitions, HotkeyActions } from "@/utils";
import { Button, Textarea } from "@headlessui/react";
import { Send } from "lucide-react";
import { useEffect, useMemo, useRef, useCallback } from "preact/hooks";

export function ChatBox() {
  const chatState = useChatState();

  const currentChat = useMemo(
    () => chatState.chats.find((c) => c.id === chatState.currentChatId),
    [chatState.chats, chatState.currentChatId]
  );

  const currentInput = useMemo(
    () => currentChat?.inputValue || "",
    [currentChat?.inputValue]
  );

  const showBigBox = useMemo(() => {
    return currentInput.split("\n").length > 1 || currentInput.length > 48;
  }, [currentInput]);

  const handleInputChange = useCallback(
    (value: string) => {
      chatState.setChatInput(chatState.currentChatId, value);
    },
    [chatState.setChatInput, chatState.currentChatId]
  );

  const handleSubmit = useCallback(() => {
    if (!currentChat || !currentInput.trim()) return;
    chatState.addMessage(currentChat.id, currentInput);
  }, [currentChat, currentInput, chatState.addMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const blurHandler = () => inputRef.current?.focus();

    if (chatState.isPromptCreationActive) {
      inputRef.current?.focus();
      inputRef.current?.addEventListener("blur", blurHandler);
    } else {
      inputRef.current?.blur();
    }

    return () => {
      inputRef.current?.removeEventListener("blur", blurHandler);
    };
  }, [chatState.isPromptCreationActive]);

  const buttonClassName = useMemo(
    () =>
      cn(
        "size-6 bg-transparent text-zinc-950 opacity-20 rounded-full p-1 flex items-center justify-center",
        currentInput.length > 0 && "opacity-100 text-white bg-blue-600"
      ),
    [currentInput.length]
  );

  const textareaClassName = useMemo(
    () =>
      cn(
        "w-full flex-1 resize-none focus:outline-none",
        showBigBox ? "h-[4.5em]" : "h-6"
      ),
    [showBigBox]
  );

  const ctrlKText = useHotkeyListenerComboText(HotkeyActions.CTRL_ALT_C);

  return (
    <div className="flex-1 h-fit w-80 flex flex-row gap-1 p-1.5 rounded-2xl border border-border/10 bg-zinc-950/5 shadow-inner items-end text-sm placeholder:text-zinc-950/50 text-zinc-950 focus-within:outline-2 outline-blue-600 transition-all duration-150">
      <Textarea
        ref={inputRef}
        className={textareaClassName}
        rows={showBigBox ? 4 : 1}
        value={currentInput}
        onChange={(e) => handleInputChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder={`What do you want to change? (${ctrlKText})`}
      />
      <Button
        className={buttonClassName}
        disabled={currentInput.length === 0}
        onClick={handleSubmit}
      >
        <Send className="size-3" />
      </Button>
    </div>
  );
}
