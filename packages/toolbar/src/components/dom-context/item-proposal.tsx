import { useReferenceElement } from "@/hooks/use-reference-element";
import { useWindowSize } from "@/hooks/use-window-size";
import { useCyclicUpdate } from "@/hooks/use-cyclic-update";
import { useCallback, useRef } from "preact/hooks";
import { HTMLAttributes } from "preact/compat";
import { Plus } from "lucide-react";

export interface ItemProposalProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
}

export function ContextItemProposal({
  refElement,
  ...props
}: ItemProposalProps) {
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

  return (
    <div
      {...props}
      className={
        "flex items-center justify-center fixed text-white rounded-lg border-2 border-blue-600/80 bg-blue-600/20 transition-all duration-100 overflow-hidden backdrop-blur-xs"
      }
      ref={boxRef}
    >
      <Plus className="size-6 drop-shadow-md drop-shadow-black" />
    </div>
  );
}
