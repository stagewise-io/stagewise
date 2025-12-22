import {
  type MouseEventHandler,
  useCallback,
  type WheelEventHandler,
} from 'react';
import { cn } from '@/utils';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';

export function DOMContextSelector() {
  const contextSelectionActive = useKartonState(
    (s) => s.browser.contextSelectionMode,
  );
  const viewportSize = useKartonState((s) => s.browser.viewportSize);

  const setMouseCoordinates = useKartonProcedure(
    (p) => p.browser.contextSelection.setMouseCoordinates,
  );
  const clearMouseCoordinates = useKartonProcedure(
    (p) => p.browser.contextSelection.clearMouseCoordinates,
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
  >(
    (event) => {
      passthroughWheelEvent({
        type: 'wheel',
        x: event.clientX,
        y: event.clientY,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
      });
    },
    [passthroughWheelEvent],
  );

  const handleSelectorMouseClick = useCallback<
    MouseEventHandler<HTMLDivElement>
  >(() => {
    selectHoveredElement();
  }, [selectHoveredElement]);

  const handleOverlayMouseDown = useCallback<MouseEventHandler<HTMLDivElement>>(
    (e) => {
      // Prevent focus switching to the tab by preventing default behavior
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const handleOverlayClick = useCallback<MouseEventHandler<HTMLDivElement>>(
    (e) => {
      // Prevent focus switching to the tab
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  return (
    <>
      {/* Full-tab overlay to prevent focus switching */}
      {contextSelectionActive && (
        <div
          className={cn('pointer-events-auto absolute inset-0 z-50 size-full')}
          onMouseDown={handleOverlayMouseDown}
          onClick={handleOverlayClick}
          onFocus={(e) => e.preventDefault()}
        />
      )}

      {/* Size-adapting selection box */}
      {contextSelectionActive && viewportSize && (
        <div
          id="element-selector-element-canvas"
          className="pointer-events-auto absolute z-50 cursor-copy"
          style={{
            top: `${viewportSize.top}px`,
            left: `${viewportSize.left}px`,
            width: `${viewportSize.width}px`,
            height: `${viewportSize.height}px`,
          }}
          onMouseMove={handleSelectorMouseMove}
          onMouseLeave={() => clearMouseCoordinates()}
          onWheel={handleSelectorMouseWheel}
          onClick={handleSelectorMouseClick}
          onMouseDown={(e) => e.preventDefault()}
        />
      )}
    </>
  );
}
