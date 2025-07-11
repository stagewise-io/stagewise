import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useRef, type HTMLAttributes } from 'react';

export interface ChipHoveredItemProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
}

export function ChipHoveredItem({
  refElement,
  ...props
}: ChipHoveredItemProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const windowSize = useWindowSize();

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current) {
      if (refElement) {
        const referenceRect = refElement.getBoundingClientRect();

        boxRef.current.style.top = `${referenceRect.top - 2}px`;
        boxRef.current.style.left = `${referenceRect.left - 2}px`;
        boxRef.current.style.width = `${referenceRect.width + 4}px`;
        boxRef.current.style.height = `${referenceRect.height + 4}px`;
        boxRef.current.style.display = undefined;
      } else {
        boxRef.current.style.height = '0px';
        boxRef.current.style.width = '0px';
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.display = 'none';
      }
    }
  }, [refElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  return (
    <div
      {...props}
      className={
        'fixed z-10 flex items-center justify-center rounded-lg border-2 border-blue-600/80 bg-blue-600/20 text-white transition-all duration-100'
      }
      ref={boxRef}
    />
  );
}
