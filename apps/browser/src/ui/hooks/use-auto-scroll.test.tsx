import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoScroll } from './use-auto-scroll';

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(0), 0),
    );
    vi.stubGlobal('cancelAnimationFrame', window.clearTimeout);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const flushScroll = () => act(() => vi.runAllTimers());

  const createViewport = (height = 1_000) => {
    const viewport = document.createElement('div');
    let scrollHeight = height;
    Object.defineProperty(viewport, 'scrollHeight', {
      get: () => scrollHeight,
    });
    return {
      viewport,
      setHeight: (nextHeight: number) => {
        scrollHeight = nextHeight;
      },
    };
  };

  it('pauses on wheel-up and resumes at the bottom', () => {
    const { result } = renderHook(() => useAutoScroll({ mode: 'virtuoso' }));
    const { viewport, setHeight } = createViewport();

    act(() => result.current.scrollerRef(viewport));
    flushScroll();
    expect(result.current.followOutput).toBe('auto');

    viewport.scrollTop = 400;
    act(() => viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 })));

    expect(result.current.isAutoScrollEnabled()).toBe(false);
    expect(result.current.followOutput).toBe(false);

    setHeight(1_500);
    act(result.current.forceEnableAutoScroll);
    flushScroll();
    expect(viewport.scrollTop).toBe(1_500);
    expect(result.current.isAutoScrollEnabled()).toBe(true);
    expect(result.current.followOutput).toBe('auto');
  });

  it('follows content growth but pauses when scrolling upward', () => {
    const { result } = renderHook(() => useAutoScroll({ mode: 'virtuoso' }));
    const { viewport, setHeight } = createViewport();

    act(() => result.current.scrollerRef(viewport));
    flushScroll();
    act(() => viewport.dispatchEvent(new Event('scroll')));

    setHeight(1_500);
    viewport.scrollTop = 1_100;
    act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(result.current.followOutput).toBe('auto');

    viewport.scrollTop = 400;
    act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(result.current.isAutoScrollEnabled()).toBe(false);

    viewport.scrollTop = 1_500;
    act(() => viewport.dispatchEvent(new Event('scroll')));
    act(() => viewport.dispatchEvent(new Event('scrollend')));
    expect(result.current.isAutoScrollEnabled()).toBe(true);
  });

  it('starts following when Virtuoso mounts a new scroller', () => {
    const { result } = renderHook(() => useAutoScroll({ mode: 'virtuoso' }));
    const first = createViewport();
    const second = createViewport(2_000);

    act(() => result.current.scrollerRef(first.viewport));
    flushScroll();
    act(result.current.disableAutoScroll);
    act(() => result.current.scrollerRef(second.viewport));
    flushScroll();

    expect(second.viewport.scrollTop).toBe(2_000);
  });

  it('follows mutations in a regular scroll container', async () => {
    const { result } = renderHook(() =>
      useAutoScroll({ initializeAtBottom: false }),
    );
    const { viewport, setHeight } = createViewport();

    act(() => result.current.scrollerRef(viewport));
    setHeight(1_500);
    await act(async () => {
      viewport.append(document.createElement('div'));
      await Promise.resolve();
    });
    flushScroll();

    expect(viewport.scrollTop).toBe(1_500);
  });
});
