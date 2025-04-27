// This component watches the whole page area for a click of the user and uses the provided callback to return
// information about the element that was hovered or clicked.
// It ignores the companion itself.

import {
  getElementAtPoint,
  getOffsetsFromPointToElement,
  getXPathForElement,
} from "@/utils";
import { useCallback, useRef } from "preact/hooks";
import { MouseEventHandler } from "preact/compat";

export interface ElementSelectorProps {
  onElementHovered: (referencePath: string) => void;
  onElementSelected: (
    referencePath: string,
    offsetTop: number,
    offsetLeft: number
  ) => void;
}

export function ElementSelector(props: ElementSelectorProps) {
  const lastHoveredElement = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const target = event.target as HTMLElement;
      if (target.closest(".companion")) return;
      const refElement = getElementAtPoint(event.clientX, event.clientY);
      if (lastHoveredElement.current !== refElement) {
        lastHoveredElement.current = refElement;
        props.onElementHovered(getXPathForElement(refElement, false));
      }
    },
    [props]
  );

  const handleMouseClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (!lastHoveredElement.current) return;
      const offsets = getOffsetsFromPointToElement(
        lastHoveredElement.current,
        event.clientX,
        event.clientY
      );
      props.onElementSelected(
        getXPathForElement(lastHoveredElement.current, false),
        offsets.offsetTop,
        offsets.offsetLeft
      );
    },
    [props]
  );

  return (
    <div
      className="pointer-events-auto fixed inset-0 h-screen w-screen"
      onMouseMove={handleMouseMove}
      onClick={handleMouseClick}
    ></div>
  );
}
