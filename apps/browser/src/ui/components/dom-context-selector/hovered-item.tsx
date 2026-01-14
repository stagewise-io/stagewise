import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '@/utils';
import { getIFrame } from '@/utils';

export interface HoveredItemProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
}

export function HoveredItem({ refElement, ...props }: HoveredItemProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const iframeRef = useRef<HTMLIFrameElement>(getIFrame());

  const windowSize = useWindowSize();

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current && refElement) {
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
      if (boxRef.current) {
        boxRef.current.style.height = '0px';
        boxRef.current.style.width = '0px';
        boxRef.current.style.top = `${windowSize.height / 2}px`;
        boxRef.current.style.left = `${windowSize.width / 2}px`;
        boxRef.current.style.display = 'none';
      }
    }
  }, [refElement, windowSize.height, windowSize.width, iframeRef.current]);

  useCyclicUpdate(updateBoxPosition, 30);

  return (
    <div
      {...props}
      className={cn(
        'absolute z-10 flex items-center justify-center rounded-sm border-3 border-blue-600/70 border-dashed bg-blue-600/5 text-white transition-colors duration-100',
      )}
      ref={boxRef}
    >
      <div className="absolute top-0.5 left-0.5 flex w-full flex-row items-start justify-start gap-1">
        <div className="flex flex-row items-center justify-center gap-0.5 overflow-hidden rounded-md bg-zinc-700/80 px-1 py-0 font-medium text-white text-xs">
          <span className="truncate">{refElement.tagName.toLowerCase()}</span>
        </div>
      </div>
    </div>
  );
}
