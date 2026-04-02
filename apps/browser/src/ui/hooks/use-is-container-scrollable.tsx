import { useCallback, useEffect, useState } from 'react';

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
  // Track the element via state so we can re-run the effect when ref becomes available
  const [element, setElement] = useState<HTMLElement | null>(null);

  // Sync the ref to state - this runs on every render to catch when ref changes
  useEffect(() => {
    const el = containerRef.current;
    if (el !== element) setElement(el);
  });

  const update = useCallback(() => {
    const el = element;
    if (!el) {
      setState(INITIAL_STATE);
      return;
    }

    const {
      scrollLeft,
      scrollTop,
      scrollWidth,
      scrollHeight,
      clientWidth,
      clientHeight,
    } = el;

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
  }, [element]);

  useEffect(() => {
    if (!element) return;

    update();

    element.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    // ResizeObserver to detect container size changes
    const ro = new ResizeObserver(update);
    ro.observe(element);

    // MutationObserver to detect when children are added/removed,
    // which changes scrollWidth/scrollHeight without changing the container's size.
    // We defer the update using requestAnimationFrame to avoid triggering state
    // updates synchronously during React's commit phase, which would cause an
    // infinite loop (MutationObserver fires during DOM mutations → setState →
    // re-render → more mutations → observer fires again).
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

    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
      mo.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [element, update]);

  return state;
}
