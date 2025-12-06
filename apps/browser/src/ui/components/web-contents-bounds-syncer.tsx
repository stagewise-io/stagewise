import { useKartonProcedure } from '@/hooks/use-karton';
import { useCallback, useLayoutEffect, useRef } from 'react';

export const WebContentsBoundsSyncer = () => {
  const updateBounds = useKartonProcedure((p) => p.browser.layout.update);
  const updateInteractivity = useKartonProcedure(
    (p) => p.browser.layout.changeInteractivity,
  );

  // State refs
  const lastBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const lastInteractiveRef = useRef<boolean | null>(null);
  const requestRef = useRef<number | null>(null);
  const isHoveringRef = useRef(false);

  useLayoutEffect(() => {
    const handleMouseEnter = (e: MouseEvent) => {
      if (e.target instanceof Element) {
        if (e.target.id === 'dev-app-preview-container') {
          isHoveringRef.current = true;
        } else if (isHoveringRef.current) {
          isHoveringRef.current = false;
        }
      }
    };

    const handleFocusChange = (e: FocusEvent) => {
      if (e.target instanceof Element) {
        if (e.target.id === 'dev-app-preview-container') {
          isHoveringRef.current = true;
        } else if (isHoveringRef.current) {
          isHoveringRef.current = false;
        }
      }
    };

    document.addEventListener('mouseenter', handleMouseEnter, {
      capture: true,
    });

    document.addEventListener('focusin', handleFocusChange, {
      capture: true,
    });

    return () => {
      document.removeEventListener('mouseenter', handleMouseEnter, {
        capture: true,
      });
      document.removeEventListener('focusin', handleFocusChange, {
        capture: true,
      });
    };
  }, []);

  const check = useCallback(() => {
    let container = document.getElementById('dev-app-preview-container');

    if (container) {
      const opacity = getEffectiveOpacity(container);
      // If opacity is below 0.5, treat as non-existing
      if (opacity < 0.5) container = null;
    }

    if (!container) {
      // If container is gone but we previously had bounds, clear them
      if (lastBoundsRef.current !== null) {
        void updateBounds(null);
        void updateInteractivity(false);
        lastBoundsRef.current = null;
      }
    } else {
      const rect = container.getBoundingClientRect();
      const newBounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };

      // Deep compare bounds
      const lastBounds = lastBoundsRef.current;
      const boundsChanged =
        !lastBounds ||
        lastBounds.x !== newBounds.x ||
        lastBounds.y !== newBounds.y ||
        lastBounds.width !== newBounds.width ||
        lastBounds.height !== newBounds.height;

      if (boundsChanged) {
        void updateBounds(newBounds);
        lastBoundsRef.current = newBounds;
      }

      // Check interactivity
      const isHovering = isHoveringRef.current;
      if (lastInteractiveRef.current !== isHovering) {
        void updateInteractivity(isHovering);
        lastInteractiveRef.current = isHovering;
      }
    }

    requestRef.current = requestAnimationFrame(check);
  }, []);

  useLayoutEffect(() => {
    requestRef.current = requestAnimationFrame(check);

    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
      // Clean up by hiding
      void updateBounds(null);
    };
  }, [check]);

  return null;
};

function getEffectiveOpacity(element: Element | null) {
  let opacity = 1; // Start at full visibility
  let current = element;

  while (current) {
    // Get the computed style of the current element
    const style = window.getComputedStyle(current);

    // Multiply the running total by the current element's opacity
    // If style.opacity is "", it defaults to 1
    if (style.opacity) {
      opacity *= Number.parseFloat(style.opacity);
    }

    // Move up to the parent
    current = current.parentElement;
  }

  return opacity;
}
