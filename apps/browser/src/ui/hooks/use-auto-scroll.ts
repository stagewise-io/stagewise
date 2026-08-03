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
  const [followOutput, setFollowOutput] = useState<'auto' | false>('auto');
  const [isAtBottom, setIsAtBottom] = useState(true);

  const setShouldFollow = useCallback((shouldFollow: boolean) => {
    if (shouldFollowRef.current === shouldFollow) return;
    shouldFollowRef.current = shouldFollow;
    setFollowOutput(shouldFollow ? 'auto' : false);
  }, []);

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

  const scrollerRef = useCallback(
    (element: HTMLElement | Window | null) => {
      const viewport = element instanceof HTMLElement ? element : null;
      viewportRef.current = viewport;
      if (viewport) setShouldFollow(true);
      else shouldFollowRef.current = false;
      setScroller(viewport);
    },
    [setShouldFollow],
  );

  const forceEnableAutoScroll = useCallback(() => {
    setShouldFollow(true);
    scrollToBottom();
  }, [scrollToBottom, setShouldFollow]);

  const disableAutoScroll = useCallback(() => {
    setShouldFollow(false);
  }, [setShouldFollow]);

  const isAutoScrollEnabled = useCallback(() => shouldFollowRef.current, []);

  const atBottomStateChange = useCallback(
    (atBottom: boolean) => {
      setIsAtBottom(atBottom);
      if (atBottom) setShouldFollow(true);
      else if (shouldFollowRef.current) scrollToBottom();
    },
    [scrollToBottom, setShouldFollow],
  );

  useEffect(() => {
    if (!scroller || !enabled) return;

    const getDistanceFromBottom = () =>
      scroller.scrollHeight - (scroller.scrollTop + scroller.clientHeight);

    let previousScrollTop = scroller.scrollTop;
    const handleScroll = () => {
      const currentScrollTop = scroller.scrollTop;
      if (
        currentScrollTop < previousScrollTop &&
        getDistanceFromBottom() > scrollEndThreshold
      ) {
        setShouldFollow(false);
      }
      previousScrollTop = currentScrollTop;
    };
    const handleScrollEnd = () => {
      if (getDistanceFromBottom() <= scrollEndThreshold) setShouldFollow(true);
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < 0 && scroller.scrollHeight > scroller.clientHeight)
        setShouldFollow(false);
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
    setShouldFollow,
  ]);

  return {
    scroller,
    scrollerRef,
    forceEnableAutoScroll,
    disableAutoScroll,
    isAutoScrollEnabled,
    followOutput,
    isAtBottom,
    atBottomStateChange,
  };
}
