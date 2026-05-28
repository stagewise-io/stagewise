import { useState, useEffect, useRef, useCallback } from 'react';
import { createRafResizeObserver } from '@ui/utils/resize-observer';

/**
 * Hook that detects the native scrollbar width.
 * On macOS, this changes dynamically based on system preferences and whether
 * a mouse is connected (overlay scrollbars = 0, traditional scrollbars = ~15px).
 *
 * Uses a ResizeObserver on a hidden measurement element to reactively detect
 * when the scrollbar mode changes.
 *
 * @returns The current scrollbar width in pixels (0 for overlay, ~15 for traditional)
 */
export function useScrollbarWidth(): number {
  const [scrollbarWidth, setScrollbarWidth] = useState(() =>
    measureScrollbarWidth(),
  );
  const measurementContainerRef = useRef<HTMLDivElement | null>(null);
  const measurementInnerRef = useRef<HTMLDivElement | null>(null);

  // Measure the scrollbar width by comparing container and inner widths
  const updateScrollbarWidth = useCallback(() => {
    const width = measureScrollbarWidth();
    setScrollbarWidth((prev) => (prev !== width ? width : prev));
  }, []);

  useEffect(() => {
    // Create the measurement elements
    const container = document.createElement('div');
    container.style.cssText = `
      position: absolute;
      top: -9999px;
      left: -9999px;
      width: 100px;
      height: 100px;
      overflow: scroll;
      visibility: hidden;
      pointer-events: none;
    `;

    const inner = document.createElement('div');
    inner.style.cssText = `
      width: 100%;
      height: 100%;
    `;

    container.appendChild(inner);
    document.body.appendChild(container);

    measurementContainerRef.current = container;
    measurementInnerRef.current = inner;

    // Initial measurement
    updateScrollbarWidth();

    // Set up ResizeObserver on the inner element
    // When scrollbar mode changes, the inner element's available width changes
    const { observer: resizeObserver, disconnect: disconnectResizeObserver } =
      createRafResizeObserver(updateScrollbarWidth);
    resizeObserver.observe(inner);

    // Also listen for window resize as a fallback
    window.addEventListener('resize', updateScrollbarWidth);

    return () => {
      disconnectResizeObserver();
      window.removeEventListener('resize', updateScrollbarWidth);
      if (container.parentNode) container.parentNode.removeChild(container);

      measurementContainerRef.current = null;
      measurementInnerRef.current = null;
    };
  }, [updateScrollbarWidth]);

  return scrollbarWidth;
}

/**
 * Measures the current scrollbar width by creating a temporary element.
 * Returns 0 if scrollbars overlay content, or ~15px if they take up space.
 */
function measureScrollbarWidth(): number {
  // Create a temporary measurement element
  const outer = document.createElement('div');
  outer.style.cssText = `
    position: absolute;
    top: -9999px;
    left: -9999px;
    width: 100px;
    height: 100px;
    overflow: scroll;
    visibility: hidden;
  `;
  document.body.appendChild(outer);

  const width = outer.offsetWidth - outer.clientWidth;

  document.body.removeChild(outer);

  return width;
}
