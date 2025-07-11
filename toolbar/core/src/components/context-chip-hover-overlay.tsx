import { useCallback, useRef } from 'react';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useWindowSize } from '@/hooks/use-window-size';
import { useContextChipHover } from '@/hooks/use-context-chip-hover';

export function ContextChipHoverOverlay() {
  const { hoveredElement } = useContextChipHover();
  const overlayRef = useRef<HTMLDivElement>(null);
  const _windowSize = useWindowSize();

  const updateOverlayPosition = useCallback(() => {
    if (overlayRef.current && hoveredElement) {
      const rect = hoveredElement.getBoundingClientRect();
      overlayRef.current.style.top = `${rect.top - 2}px`;
      overlayRef.current.style.left = `${rect.left - 2}px`;
      overlayRef.current.style.width = `${rect.width + 4}px`;
      overlayRef.current.style.height = `${rect.height + 4}px`;
    }
  }, [hoveredElement]);

  useCyclicUpdate(updateOverlayPosition, 30);

  if (!hoveredElement) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className="pointer-events-none fixed z-10 rounded-lg border-2 border-blue-500/80 bg-blue-500/10 transition-all duration-100"
    />
  );
}
