import { useReferenceElement } from "@/hooks/use-reference-element";
import { useWindowSize } from "@/hooks/use-window-size";
import { useCyclicUpdate } from "@/hooks/use-cyclic-update";
import { useCallback, useRef } from "preact/hooks";
import { HTMLAttributes } from "preact/compat";

export interface ReferenceElementBoxProps
  extends HTMLAttributes<HTMLDivElement> {
  referencePath: string;
}

export function ReferenceElementBox({
  referencePath,
  ...props
}: ReferenceElementBoxProps) {
  const referenceElement = useReferenceElement(referencePath);

  const boxRef = useRef<HTMLDivElement>(null);

  const windowSize = useWindowSize();

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current) {
      if (referenceElement.current) {
        const referenceRect = referenceElement.current.getBoundingClientRect();

        boxRef.current.style.top = `${referenceRect.top}px`;
        boxRef.current.style.left = `${referenceRect.left}px`;
        boxRef.current.style.width = `${referenceRect.width}px`;
        boxRef.current.style.height = `${referenceRect.height}px`;
        boxRef.current.style.border = "";
        boxRef.current.style.display = "block";
      } else {
        boxRef.current.style.height = "0px";
        boxRef.current.style.width = "0px";
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.border = "none";
        boxRef.current.style.display = "none";
      }
    }
  }, [referenceElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  return (
    <div
      {...props}
      className={
        "fixed rounded-lg border-2 border-blue-600/80 bg-blue-600/5 transition-all duration-0"
      }
      ref={boxRef}
    />
  );
}
