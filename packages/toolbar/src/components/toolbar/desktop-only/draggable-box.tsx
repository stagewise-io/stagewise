// This component represents the box in which the toolbar is placed.
// It is only used in desktop cases, since the mobile toolbar is placed inside a modal card.

import { Button } from "@headlessui/react";
import { GripVertical, Plus } from "lucide-react";
import { ChatArea } from "../chat-area";
import { ChatBox } from "../chat-box";
import { MoreActionsButton } from "../more-actions-button";
import { useDraggable } from "@/hooks/use-draggable";
import { MutableRef } from "preact/hooks";

export function ToolbarDraggableBox() {
  return (
    <div className="absolute p-0.5 pointer-events-auto bottom-5 left-1/2 -translate-x-1/2">
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div className="pointer-events-auto flex flex-col p-0 items-start justify-center rounded-3xl border border-border/30 bg-zinc-50/60 shadow-lg backdrop-blur-lg transition-colors w-96 max-w-[80vw]">
        <ChatArea />
        {/* <ToolbarDraggingGrip /> */}
        {/* If the app state is right, we also render the button that enables dragging the toolbar around */}
        <div className="w-full flex flex-row items-center justify-center rounded-3xl first:border-none border-t border-border/30 bg-background/40 p-1.5 shadow-lg transition-colors">
          <ChatBox />
          <MoreActionsButton />
        </div>
      </div>
    </div>
  );
}

export function ToolbarDraggingGrip(props: object) {
  return (
    <Button
      {...props}
      className="flex h-8 w-6 bg-transparent shrink-0 cursor-grab items-center justify-center focus:cursor-grabbing"
    >
      <GripVertical className="size-5 text-border/60" />
    </Button>
  );
}
