import {
  type MouseEventHandler,
  useCallback,
  type WheelEventHandler,
} from 'react';
import { cn } from '@/utils';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';

export function DOMContextSelector({
  ref,
}: {
  ref?: React.RefObject<HTMLDivElement>;
}) {
  const contextSelectionActive = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );

  const setMouseCoordinates = useKartonProcedure(
    (p) => p.browser.contextSelection.setMouseCoordinates,
  );
  const passthroughWheelEvent = useKartonProcedure(
    (p) => p.browser.contextSelection.passthroughWheelEvent,
  );
  const selectHoveredElement = useKartonProcedure(
    (p) => p.browser.contextSelection.selectHoveredElement,
  );

  const handleSelectorMouseMove = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(
    (event) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const x = Math.floor(event.clientX - rect.left);
      const y = Math.floor(event.clientY - rect.top);
      setMouseCoordinates(x, y);
    },
    [setMouseCoordinates],
  );

  const handleSelectorMouseWheel = useCallback<
    WheelEventHandler<HTMLDivElement>
  >((event) => {
    passthroughWheelEvent(event.nativeEvent);
  }, []);

  const handleSelectorMouseClick = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    selectHoveredElement();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'pointer-events-none absolute inset-0 size-full overflow-hidden',
      )}
    >
      {contextSelectionActive && (
        <div
          className="pointer-events-auto absolute inset-0 size-full cursor-copy"
          onMouseMove={handleSelectorMouseMove}
          onWheel={handleSelectorMouseWheel}
          onClick={handleSelectorMouseClick}
        />
      )}
    </div>
  );
}
