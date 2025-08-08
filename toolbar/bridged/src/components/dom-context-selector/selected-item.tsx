import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useRef, type HTMLAttributes } from 'react';
import { cn } from '@/utils';

export interface SelectedItemProps extends HTMLAttributes<HTMLButtonElement> {
  refElement: HTMLElement;
  isChipHovered: boolean;
  onRemoveClick: () => void;
}

export function SelectedItem({
  refElement,
  isChipHovered,
  ...props
}: SelectedItemProps) {
  const boxRef = useRef<HTMLButtonElement>(null);

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
        boxRef.current.style.opacity = 'none';
      }
    }
  }, [refElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  return (
    <button
      {...props}
      className={cn(
        'pointer-events-auto fixed flex cursor-not-allowed items-center justify-center rounded-sm border-2 border-zinc-600/70 border-dotted transition-all duration-100 hover:border-rose-600/70 hover:bg-rose-600/5',
        isChipHovered && 'border-blue-600/70 bg-blue-600/5',
      )}
      onClick={props.onRemoveClick}
      ref={boxRef}
    />
  );
}
