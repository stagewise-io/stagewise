import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useRef, type HTMLAttributes } from 'react';
import { cn, getIFrame } from '@/utils';

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

  const iframeRef = useRef<HTMLIFrameElement>(getIFrame());

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current) {
      if (refElement) {
        const referenceRect = refElement.getBoundingClientRect();

        const iFrameScale = iframeRef.current
          ? iframeRef.current.getBoundingClientRect().width /
            iframeRef.current.offsetWidth
          : 1;

        boxRef.current.style.top = `${referenceRect.top * iFrameScale - 2}px`;
        boxRef.current.style.left = `${referenceRect.left * iFrameScale - 2}px`;
        boxRef.current.style.width = `${referenceRect.width * iFrameScale + 4}px`;
        boxRef.current.style.height = `${referenceRect.height * iFrameScale + 4}px`;
        boxRef.current.style.display = '';
      } else {
        boxRef.current.style.height = '0px';
        boxRef.current.style.width = '0px';
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.opacity = 'none';
      }
    }
  }, [refElement, windowSize.height, windowSize.width, iframeRef.current]);

  useCyclicUpdate(updateBoxPosition, 20);

  return (
    <button
      {...props}
      className={cn(
        'pointer-events-auto absolute flex cursor-not-allowed items-center justify-center rounded-sm border-3 border-zinc-600/70 border-dashed transition-colors duration-100 hover:border-rose-600/70 hover:bg-rose-600/5',
        isChipHovered && 'border-blue-600/70 bg-blue-600/5',
      )}
      onClick={props.onRemoveClick}
      ref={boxRef}
    />
  );
}
