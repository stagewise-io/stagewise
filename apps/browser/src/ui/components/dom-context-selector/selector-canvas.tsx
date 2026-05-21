import { useCallback, useEffect, useRef } from 'react';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useOverlayAccess, type AccessHandle } from '@ui/contexts';
import { useEventListener } from '@ui/hooks/use-event-listener';

/**
 * DOMContextSelector uses the unified overlay system to capture mouse events
 * when element selection mode is active. It requests exclusive access to
 * prevent other tools from interfering.
 */
export function DOMContextSelector() {
  const contextSelectionActive = useKartonState(
    (s) => s.browsing.contextSelectionMode,
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
  const setContextSelectionActive = useKartonProcedure(
    (p) => p.browser.contextSelection.setActive,
  );

  const { requestAccess, releaseAccess, overlayRef } = useOverlayAccess();
  const handleRef = useRef<AccessHandle | null>(null);

  // Request exclusive access when context selection becomes active
  useEffect(() => {
    if (contextSelectionActive && viewportSize) {
      // Request exclusive access
      const handle = requestAccess({
        exclusive: true,
        cursor: 'copy',
        handlers: {
          mousemove: (e) => {
            const overlay = overlayRef.current;
            if (!overlay || !viewportSize) return;

            const overlayRect = overlay.getBoundingClientRect();
            const rawX = e.originalEvent.clientX - overlayRect.left;
            const rawY = e.originalEvent.clientY - overlayRect.top;

            // Adjust coordinates relative to the viewport position within the overlay
            const x = Math.floor(rawX - viewportSize.left);
            const y = Math.floor(rawY - viewportSize.top);

            // Only send coordinates if within viewport bounds
            if (
              x >= 0 &&
              y >= 0 &&
              x < viewportSize.width &&
              y < viewportSize.height
            ) {
              setMouseCoordinates(x, y);
            }
          },
          mouseleave: () => {
            clearMouseCoordinates();
          },
          wheel: (e) => {
            const overlay = overlayRef.current;
            if (!overlay) return;

            const wheelEvent = e.originalEvent as React.WheelEvent;
            passthroughWheelEvent({
              type: 'wheel',
              x: wheelEvent.clientX,
              y: wheelEvent.clientY,
              deltaX: wheelEvent.deltaX,
              deltaY: wheelEvent.deltaY,
            });
          },
          click: (e) => {
            selectHoveredElement();
            e.stopPropagation();
          },
          mousedown: (e) => {
            // Prevent focus switching
            e.originalEvent.preventDefault();
            e.stopPropagation();
          },
        },
      });

      if (handle) {
        handleRef.current = handle;
      }
    } else {
      // Release when context selection becomes inactive
      if (handleRef.current) {
        releaseAccess(handleRef.current);
        handleRef.current = null;
      }
    }
  }, [
    contextSelectionActive,
    viewportSize,
    requestAccess,
    releaseAccess,
    overlayRef,
    setMouseCoordinates,
    clearMouseCoordinates,
    passthroughWheelEvent,
    selectHoveredElement,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (handleRef.current) {
        releaseAccess(handleRef.current);
        handleRef.current = null;
      }
    };
  }, [releaseAccess]);

  // Cancel selection on ESC key
  // Use capture phase to run before other ESC handlers
  const handleEscapeKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && contextSelectionActive) {
        e.preventDefault();
        e.stopPropagation();
        setContextSelectionActive(false);
      }
    },
    [contextSelectionActive, setContextSelectionActive],
  );

  useEventListener('keydown', handleEscapeKey, { capture: true });

  // This component no longer renders its own overlay - it uses the unified system
  return null;
}
