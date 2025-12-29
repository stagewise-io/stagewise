import { useCallback, useEffect, useState } from 'react';

export function useIsContainerScrollable(
  containerRef: React.RefObject<HTMLElement>,
) {
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  // Track the element via state so we can re-run the effect when ref becomes available
  const [element, setElement] = useState<HTMLElement | null>(null);

  // Sync the ref to state - this runs on every render to catch when ref changes
  useEffect(() => {
    const el = containerRef.current;
    if (el !== element) {
      setElement(el);
    }
  });

  const update = useCallback(() => {
    const el = element;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      setCanScrollUp(false);
      setCanScrollDown(false);
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

    // Horizontal scroll
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth);

    // Vertical scroll
    setCanScrollUp(scrollTop > 0);
    setCanScrollDown(scrollTop + clientHeight < scrollHeight);
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
    // which changes scrollWidth/scrollHeight without changing the container's size
    const mo = new MutationObserver(update);
    mo.observe(element, { childList: true, subtree: true });

    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [element, update]);

  return {
    canScrollLeft,
    canScrollRight,
    canScrollUp,
    canScrollDown,
  };
}
