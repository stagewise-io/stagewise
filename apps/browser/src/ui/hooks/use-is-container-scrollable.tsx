import { useEffect, useRef, useState } from 'react';
import { createRafResizeObserver } from '@ui/utils/resize-observer';

interface ScrollState {
  canScrollLeft: boolean;
  canScrollRight: boolean;
  canScrollUp: boolean;
  canScrollDown: boolean;
}

const INITIAL_STATE: ScrollState = {
  canScrollLeft: false,
  canScrollRight: false,
  canScrollUp: false,
  canScrollDown: false,
};

export function useIsContainerScrollable(
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const [state, setState] = useState<ScrollState>(INITIAL_STATE);
  const cleanupRef = useRef<(() => void) | null>(null);
  const observedElementRef = useRef<HTMLElement | null>(null);
  const retryFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const cancelRetry = () => {
      if (retryFrameRef.current === null) return;
      cancelAnimationFrame(retryFrameRef.current);
      retryFrameRef.current = null;
    };

    const cleanupObservedElement = () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      observedElementRef.current = null;
    };

    const resetState = () => {
      setState((prev) => {
        if (
          !prev.canScrollLeft &&
          !prev.canScrollRight &&
          !prev.canScrollUp &&
          !prev.canScrollDown
        )
          return prev;
        return INITIAL_STATE;
      });
    };

    const observeElement = (element: HTMLElement) => {
      const update = () => {
        const {
          scrollLeft,
          scrollTop,
          scrollWidth,
          scrollHeight,
          clientWidth,
          clientHeight,
        } = element;

        // Small threshold to handle subpixel rendering precision issues
        const threshold = 1;

        const next: ScrollState = {
          canScrollLeft: scrollLeft > threshold,
          canScrollRight: scrollLeft + clientWidth < scrollWidth - threshold,
          canScrollUp: scrollTop > threshold,
          canScrollDown: scrollTop + clientHeight < scrollHeight - threshold,
        };

        setState((prev) => {
          if (
            prev.canScrollLeft === next.canScrollLeft &&
            prev.canScrollRight === next.canScrollRight &&
            prev.canScrollUp === next.canScrollUp &&
            prev.canScrollDown === next.canScrollDown
          )
            return prev;
          return next;
        });
      };

      update();

      element.addEventListener('scroll', update);
      window.addEventListener('resize', update);

      // ResizeObserver to detect container size changes
      const { observer: ro, disconnect: disconnectResizeObserver } =
        createRafResizeObserver(update);
      ro.observe(element);

      // MutationObserver to detect when children are added/removed,
      // which changes scrollWidth/scrollHeight without changing the
      // container's size. We defer the update using requestAnimationFrame to
      // avoid triggering state updates synchronously during React's commit
      // phase, which would cause an infinite loop (MutationObserver fires
      // during DOM mutations → setState → re-render → more mutations →
      // observer fires again).
      let rafId: number | null = null;
      const deferredUpdate = () => {
        if (rafId !== null) return; // Already scheduled
        rafId = requestAnimationFrame(() => {
          rafId = null;
          update();
        });
      };
      const mo = new MutationObserver(deferredUpdate);
      mo.observe(element, { childList: true, subtree: true });

      observedElementRef.current = element;
      cleanupRef.current = () => {
        element.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        disconnectResizeObserver();
        mo.disconnect();
        if (rafId !== null) cancelAnimationFrame(rafId);
      };
    };

    const ensureObservedElement = () => {
      retryFrameRef.current = null;
      const element = containerRef.current;

      if (element === observedElementRef.current) return;

      cleanupObservedElement();

      if (!element) {
        resetState();
        retryFrameRef.current = requestAnimationFrame(ensureObservedElement);
        return;
      }

      observeElement(element);
    };

    cancelRetry();
    ensureObservedElement();

    return cancelRetry;
  });

  useEffect(() => {
    return () => {
      if (retryFrameRef.current !== null) {
        cancelAnimationFrame(retryFrameRef.current);
        retryFrameRef.current = null;
      }
      cleanupRef.current?.();
      cleanupRef.current = null;
      observedElementRef.current = null;
    };
  }, []);

  return state;
}
