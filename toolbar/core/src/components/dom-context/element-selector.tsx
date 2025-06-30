// This component watches the whole page area for a click of the user and uses the provided callback to return
// information about the element that was hovered or clicked.
// It ignores the companion itself.

import { getElementAtPoint } from '@/utils';
import { useCallback, useRef } from 'react';
import type { MouseEventHandler } from 'react';

export interface ElementSelectorProps {
  onElementHovered: (element: HTMLElement) => void;
  onElementUnhovered: () => void;
  onElementSelected: (element: HTMLElement) => void;
  ignoreList: HTMLElement[];
}

export function ElementSelector(props: ElementSelectorProps) {
  const lastHoveredElement = useRef<HTMLElement | null>(null);

  const handleMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('.companion')) return;
      const refElement = getElementAtPoint(event.clientX, event.clientY);
      if (props.ignoreList.includes(refElement)) return;
      if (lastHoveredElement.current !== refElement) {
        lastHoveredElement.current = refElement;
        props.onElementHovered(refElement);
      }
    },
    [props],
  );

  const handleMouseLeave = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    lastHoveredElement.current = null;
    props.onElementUnhovered();
  }, [props]);

  const handleMouseClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (!lastHoveredElement.current) return;
      if (props.ignoreList.includes(lastHoveredElement.current)) return;

      props.onElementSelected(lastHoveredElement.current);
    },
    [props],
  );

  return (
    <div
      className="pointer-events-auto fixed inset-0 h-screen w-screen cursor-copy"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleMouseClick}
      role="button"
      tabIndex={0}
    />
  );
}
