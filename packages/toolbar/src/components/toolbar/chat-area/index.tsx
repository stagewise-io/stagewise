/** The chat area is the top section of the toolbar that can either be hidden or expanded, based on the likings and the ations of the user. */

import { useChatState } from "@/hooks/use-chat-state";
import { Plus } from "lucide-react";
import { Button } from "@headlessui/react";
import { ChevronDown, ChevronUp, XCircle } from "lucide-react";
import { ComponentChildren } from "preact";

export function ChatArea() {
  const { chatAreaState } = useChatState();

  return chatAreaState === "hidden" ? null : (
    <ChatAreaBox>
      <ChatAreaResizeBar />
      {chatAreaState === "compact" && <ChatAreaCompact />}
      {chatAreaState === "expanded" && <ChatAreaExpanded />}
    </ChatAreaBox>
  );
}

function ChatAreaBox({ children }: { children: ComponentChildren }) {
  return <div className="w-full h-auto">{children}</div>;
}

function ChatAreaResizeBar() {
  const { chatAreaState, setChatAreaState } = useChatState();

  const handleResizeBarClick = () => {
    setChatAreaState(chatAreaState === "compact" ? "expanded" : "compact");
  };

  const handleCloseChatArea = () => {
    setChatAreaState("hidden");
  };

  return (
    <div className="w-full h-5 rounded-t-3xl bg-zinc-950/5 flex flex-row justify-between items-center">
      <div className="size-5" />
      <Button
        className="bg-transparent text-muted-foreground/50 hover:text-muted-foreground h-5 p-1 transition-colors duration-100"
        onClick={handleResizeBarClick}
      >
        {chatAreaState === "compact" ? <ChevronUp /> : <ChevronDown />}
      </Button>
      <Button
        className="size-5 bg-transparent text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-100"
        onClick={handleCloseChatArea}
      >
        <XCircle />
      </Button>
    </div>
  );
}

function ChatAreaCompact() {
  return (
    <div className="w-full flex flex-col gap-1 p-3">
      <span className="text-sm text-zinc-950/50">
        This is the compact chat area... Showing just the last response from the
        assistant.
      </span>
    </div>
  );
}

function ChatAreaExpanded() {
  return (
    <div className="w-full flex flex-col gap-1 p-3">
      <span className="text-sm text-zinc-950/50">
        This is the expanded chat area...
        <br />
        We can show the whole conversation in here.
      </span>
      <div className="flex flex-row gap-2 items-center justify-start">
        <Button className="text-xs px-2 h-6 rounded-full bg-zinc-950/5 text-foreground font-semibold">
          Current chat
        </Button>
        <Button className="text-xs px-2 h-6 rounded-full bg-zinc-950/5 text-foreground font-semibold">
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}
