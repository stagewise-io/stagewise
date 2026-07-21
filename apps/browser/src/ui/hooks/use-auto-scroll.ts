import { useCallback, useEffect, useRef, useState } from 'react';

type UseAutoScrollOptions = {
  enabled?: boolean;
  initializeAtBottom?: boolean;
  mode?: 'dom' | 'virtuoso';
  scrollEndThreshold?: number;
};

export function useAutoScroll({
  enabled = true,
  initializeAtBottom = true,
  mode = 'dom',
  scrollEndThreshold = 80,
}: UseAutoScrollOptions = {}) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const shouldFollowRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const [scroller, setScroller] = useState<HTMLElement | null>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollFrameRef.current !== null)
      cancelAnimationFrame(scrollFrameRef.current);

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport || !shouldFollowRef.current) return;
      viewport.scrollTop = viewport.scrollHeight;
    });
  }, []);

  const scrollerRef = useCallback((element: HTMLElement | Window | null) => {
    const viewport = element instanceof HTMLElement ? element : null;
    viewportRef.current = viewport;
    shouldFollowRef.current = viewport !== null;
    setScroller(viewport);
  }, []);

  const forceEnableAutoScroll = useCallback(() => {
    shouldFollowRef.current = true;
    scrollToBottom();
  }, [scrollToBottom]);

  const disableAutoScroll = useCallback(() => {
    shouldFollowRef.current = false;
  }, []);

  const isAutoScrollEnabled = useCallback(() => shouldFollowRef.current, []);

  useEffect(() => {
    if (!scroller || !enabled) return;

    const handleScroll = () => {
      const distanceFromBottom =
        scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
      if (distanceFromBottom > 1) shouldFollowRef.current = false;
    };
    const handleScrollEnd = () => {
      const distanceFromBottom =
        scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);
      if (distanceFromBottom <= scrollEndThreshold)
        shouldFollowRef.current = true;
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0) shouldFollowRef.current = false;
    };

    scroller.addEventListener('wheel', handleWheel, { passive: true });
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    scroller.addEventListener('scrollend', handleScrollEnd);

    let observer: MutationObserver | undefined;
    if (mode === 'dom') {
      observer = new MutationObserver(scrollToBottom);
      observer.observe(scroller, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    if (initializeAtBottom) forceEnableAutoScroll();

    return () => {
      scroller.removeEventListener('wheel', handleWheel);
      scroller.removeEventListener('scroll', handleScroll);
      scroller.removeEventListener('scrollend', handleScrollEnd);
      observer?.disconnect();
      if (scrollFrameRef.current !== null)
        cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [
    enabled,
    forceEnableAutoScroll,
    initializeAtBottom,
    mode,
    scrollEndThreshold,
    scroller,
    scrollToBottom,
  ]);

  return {
    scroller,
    scrollerRef,
    forceEnableAutoScroll,
    disableAutoScroll,
    isAutoScrollEnabled,
    followOutput: 'auto' as const,
  };
}
