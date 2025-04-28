import { useReferenceElement } from "@/hooks/use-reference-element";
import { useWindowSize } from "@/hooks/use-window-size";
import { useCyclicUpdate } from "@/hooks/use-cyclic-update";
import { useCallback, useRef } from "preact/hooks";
import { HTMLAttributes } from "preact/compat";
import { Trash2 } from "lucide-react";
import { useChatState } from "@/hooks/use-chat-state";

export interface ContextItemProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
}

export function ContextItem({ refElement, ...props }: ContextItemProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const windowSize = useWindowSize();

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current) {
      if (refElement) {
        const referenceRect = refElement.getBoundingClientRect();

        boxRef.current.style.top = `${referenceRect.top}px`;
        boxRef.current.style.left = `${referenceRect.left}px`;
        boxRef.current.style.width = `${referenceRect.width}px`;
        boxRef.current.style.height = `${referenceRect.height}px`;
        boxRef.current.style.display = undefined;
      } else {
        boxRef.current.style.height = "0px";
        boxRef.current.style.width = "0px";
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.display = "none";
      }
    }
  }, [refElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  const chatState = useChatState();

  const handleDeleteClick = useCallback(() => {
    chatState.removeChatDomContext(chatState.currentChatId, refElement);
  }, [chatState, refElement]);

  return (
    <div
      {...props}
      className={
        "pointer-events-auto flex items-center justify-center fixed rounded-lg border-2 border-green-600/80 bg-green-600/5 transition-all duration-0 overflow-hidden hover:bg-red-600/20 hover:border-red-600/80 hover:text-white hover:backdrop-blur-sm text-transparent cursor-pointer"
      }
      ref={boxRef}
      onClick={handleDeleteClick}
    >
      <Trash2 className="size-6 drop-shadow-md drop-shadow-black" />
    </div>
  );
}
