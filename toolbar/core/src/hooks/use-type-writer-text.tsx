import { useEffect, useRef, useState } from 'react';

export interface TypeWriterConfig {
  /** Number of characters to reveal per interval. Default: 1 */
  charsPerInterval?: number;
  /** Number of frames between intervals if msPerInterval is not provided. Default: 1 */
  framesPerInterval?: number;
  /** Milliseconds between intervals. If provided, overrides framesPerInterval. Default: undefined */
  msPerInterval?: number;
  /** Show all text on first render immediately. Default: true */
  showAllOnFirstRender?: boolean;
  /** Only animate when text length increases; decreases apply immediately. Default: true */
  animateOnIncreaseOnly?: boolean;
}

export function useTypeWriterText(
  text: string,
  {
    charsPerInterval = 1,
    framesPerInterval = 1,
    msPerInterval,
    showAllOnFirstRender = true,
    animateOnIncreaseOnly = true,
  }: TypeWriterConfig = {},
): string {
  // Initialize with either full text or empty depending on first-render policy
  const [displayedLength, setDisplayedLength] = useState(
    showAllOnFirstRender ? text.length : 0,
  );
  const displayedLengthRef = useRef(displayedLength);
  const targetLengthRef = useRef(text.length);
  const previousTextLengthRef = useRef(text.length);
  const isFirstRenderRef = useRef(true);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number | null>(null);
  const timeAccumulatorRef = useRef(0);

  // Keep refs in sync with state/inputs
  useEffect(() => {
    displayedLengthRef.current = displayedLength;
  }, [displayedLength]);

  useEffect(() => {
    // First render behavior
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousTextLengthRef.current = text.length;
      targetLengthRef.current = text.length;
      // Ensure state is correct for first render policy
      const initialLength = showAllOnFirstRender ? text.length : 0;
      if (displayedLengthRef.current !== initialLength) {
        displayedLengthRef.current = initialLength;
        setDisplayedLength(initialLength);
      }
      return;
    }

    // Handle decreases
    if (text.length < previousTextLengthRef.current) {
      if (animateOnIncreaseOnly) {
        // Apply immediately without animation
        displayedLengthRef.current = text.length;
        setDisplayedLength(text.length);
        targetLengthRef.current = text.length;
        previousTextLengthRef.current = text.length;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
        lastFrameTimeRef.current = null;
        timeAccumulatorRef.current = 0;
        return;
      }
      // If decreases should be animated (not default), simply set target and fall through
      targetLengthRef.current = text.length;
      previousTextLengthRef.current = text.length;
    }

    // Handle increases
    if (text.length > previousTextLengthRef.current) {
      targetLengthRef.current = text.length;
      previousTextLengthRef.current = text.length;
    }

    // Nothing to animate if target is already reached
    if (displayedLengthRef.current >= targetLengthRef.current) return;

    // Configure interval
    const intervalMs =
      typeof msPerInterval === 'number'
        ? Math.max(0, msPerInterval)
        : Math.max(0, framesPerInterval) * (1000 / 60);

    const animate = () => {
      const now = performance.now();
      if (lastFrameTimeRef.current == null) {
        lastFrameTimeRef.current = now;
      }
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      timeAccumulatorRef.current += delta;

      if (timeAccumulatorRef.current >= intervalMs) {
        timeAccumulatorRef.current -= intervalMs;
        setDisplayedLength(() => {
          const target = targetLengthRef.current;
          const current = displayedLengthRef.current;
          const next = Math.min(current + charsPerInterval, target);
          displayedLengthRef.current = next;
          if (next < target) {
            animationFrameRef.current = requestAnimationFrame(animate);
          } else {
            animationFrameRef.current = undefined;
          }
          return next;
        });
      } else {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    // Start animation if not already running
    if (!animationFrameRef.current) {
      lastFrameTimeRef.current = null;
      timeAccumulatorRef.current = 0;
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [
    text,
    charsPerInterval,
    framesPerInterval,
    msPerInterval,
    showAllOnFirstRender,
    animateOnIncreaseOnly,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return text.slice(0, displayedLength);
}
