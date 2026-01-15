import { useEffect, useRef, useState } from 'react';

// Algorithm constants - tuned for smooth adaptive behavior
const BASE_SPEED = 80; // chars/sec - natural feel for slow streams
const ACCELERATION_FACTOR = 3; // How aggressively speed scales with backlog
const BACKLOG_THRESHOLD = 30; // chars before acceleration kicks in
const CATCHUP_MULTIPLIER = 15; // Fast catch-up when stream ends (~100ms completion)

export interface AdaptiveTypeWriterConfig {
  /** Base reveal speed in chars/sec. Default: 80 */
  baseSpeed?: number;
  /** Show all text on first render immediately. Default: true */
  showAllOnFirstRender?: boolean;
  /** Only animate when text length increases; decreases apply immediately. Default: true */
  animateOnIncreaseOnly?: boolean;
  /** Whether stream is still active (enables fast catch-up when false). Default: true */
  isStreaming?: boolean;
}

/**
 * Adaptive typewriter hook that dynamically adjusts reveal speed based on
 * text generation rate. Uses exponential catch-up during streaming and
 * fast completion when streaming ends.
 *
 * @param text - The full text to display
 * @param config - Configuration options
 * @returns The portion of text to display
 */
export function useTypeWriterText(
  text: string,
  {
    baseSpeed = BASE_SPEED,
    showAllOnFirstRender = true,
    animateOnIncreaseOnly = true,
    isStreaming = true,
  }: AdaptiveTypeWriterConfig = {},
): string {
  // Initialize with either full text or empty depending on first-render policy
  const [displayedLength, setDisplayedLength] = useState(
    showAllOnFirstRender ? text.length : 0,
  );

  // Refs for animation state (avoid re-renders during animation)
  const displayedLengthRef = useRef(displayedLength);
  const targetLengthRef = useRef(text.length);
  const previousTextLengthRef = useRef(text.length);
  const isFirstRenderRef = useRef(true);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastFrameTimeRef = useRef<number | null>(null);
  const charAccumulatorRef = useRef(0); // Fractional character progress

  // Keep isStreaming in a ref so animation loop has latest value
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Keep baseSpeed in a ref
  const baseSpeedRef = useRef(baseSpeed);
  useEffect(() => {
    baseSpeedRef.current = baseSpeed;
  }, [baseSpeed]);

  // Keep displayedLengthRef in sync with state
  useEffect(() => {
    displayedLengthRef.current = displayedLength;
  }, [displayedLength]);

  /**
   * Calculate adaptive speed based on backlog and streaming state.
   * During streaming: logarithmic scaling for smooth catch-up
   * After streaming: fast completion to avoid waiting
   */
  const calculateSpeed = (backlog: number, streaming: boolean): number => {
    if (backlog <= 0) return 0;

    if (streaming) {
      // Logarithmic scaling: speed increases smoothly with backlog
      // Formula: baseSpeed * (1 + factor * ln(1 + backlog / threshold))
      const scaleFactor =
        1 + ACCELERATION_FACTOR * Math.log(1 + backlog / BACKLOG_THRESHOLD);
      return baseSpeedRef.current * scaleFactor;
    }
    // Fast catch-up when streaming ends
    // Speed proportional to remaining backlog for quick completion
    return Math.max(backlog * CATCHUP_MULTIPLIER, baseSpeedRef.current * 5);
  };

  // Main animation effect
  useEffect(() => {
    // First render behavior
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      previousTextLengthRef.current = text.length;
      targetLengthRef.current = text.length;
      const initialLength = showAllOnFirstRender ? text.length : 0;
      if (displayedLengthRef.current !== initialLength) {
        displayedLengthRef.current = initialLength;
        charAccumulatorRef.current = 0;
        setDisplayedLength(initialLength);
      }
      return;
    }

    // Handle text decreases
    if (text.length < previousTextLengthRef.current) {
      if (animateOnIncreaseOnly) {
        // Apply immediately without animation
        displayedLengthRef.current = text.length;
        targetLengthRef.current = text.length;
        previousTextLengthRef.current = text.length;
        charAccumulatorRef.current = 0;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
        lastFrameTimeRef.current = null;
        setDisplayedLength(text.length);
        return;
      }
      targetLengthRef.current = text.length;
      previousTextLengthRef.current = text.length;
    }

    // Handle text increases
    if (text.length > previousTextLengthRef.current) {
      targetLengthRef.current = text.length;
      previousTextLengthRef.current = text.length;
    }

    // Nothing to animate if target is already reached
    if (displayedLengthRef.current >= targetLengthRef.current) return;

    // Animation loop using requestAnimationFrame
    const animate = () => {
      const now = performance.now();

      // Initialize timestamp on first frame
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = now;
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate delta time in seconds
      const deltaMs = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      const deltaSec = deltaMs / 1000;

      // Calculate current backlog
      const target = targetLengthRef.current;
      const current = displayedLengthRef.current;
      const backlog = target - current;

      if (backlog <= 0) {
        // Target reached, stop animation
        animationFrameRef.current = undefined;
        return;
      }

      // Calculate adaptive speed
      const speed = calculateSpeed(backlog, isStreamingRef.current);

      // Accumulate fractional characters
      charAccumulatorRef.current += speed * deltaSec;

      // Extract whole characters to reveal
      const charsToReveal = Math.floor(charAccumulatorRef.current);

      if (charsToReveal > 0) {
        charAccumulatorRef.current -= charsToReveal;
        const nextLength = Math.min(current + charsToReveal, target);
        displayedLengthRef.current = nextLength;
        setDisplayedLength(nextLength);

        if (nextLength >= target) {
          // Animation complete
          animationFrameRef.current = undefined;
          charAccumulatorRef.current = 0;
          return;
        }
      }

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    // Start animation if not already running
    if (!animationFrameRef.current) {
      lastFrameTimeRef.current = null;
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [text, showAllOnFirstRender, animateOnIncreaseOnly]);

  // Trigger fast catch-up when streaming ends
  useEffect(() => {
    if (!isStreaming && displayedLengthRef.current < targetLengthRef.current) {
      // Streaming just ended but we have backlog - ensure animation is running
      if (!animationFrameRef.current) {
        lastFrameTimeRef.current = null;
        const animate = () => {
          const now = performance.now();

          if (lastFrameTimeRef.current === null) {
            lastFrameTimeRef.current = now;
            animationFrameRef.current = requestAnimationFrame(animate);
            return;
          }

          const deltaMs = now - lastFrameTimeRef.current;
          lastFrameTimeRef.current = now;
          const deltaSec = deltaMs / 1000;

          const target = targetLengthRef.current;
          const current = displayedLengthRef.current;
          const backlog = target - current;

          if (backlog <= 0) {
            animationFrameRef.current = undefined;
            return;
          }

          // Fast catch-up speed
          const speed = calculateSpeed(backlog, false);
          charAccumulatorRef.current += speed * deltaSec;
          const charsToReveal = Math.floor(charAccumulatorRef.current);

          if (charsToReveal > 0) {
            charAccumulatorRef.current -= charsToReveal;
            const nextLength = Math.min(current + charsToReveal, target);
            displayedLengthRef.current = nextLength;
            setDisplayedLength(nextLength);

            if (nextLength >= target) {
              animationFrameRef.current = undefined;
              charAccumulatorRef.current = 0;
              return;
            }
          }

          animationFrameRef.current = requestAnimationFrame(animate);
        };

        animationFrameRef.current = requestAnimationFrame(animate);
      }
    }
  }, [isStreaming]);

  // When returning to a visible tab, immediately reveal full text
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const fullLength = targetLengthRef.current;
        displayedLengthRef.current = fullLength;
        previousTextLengthRef.current = fullLength;
        charAccumulatorRef.current = 0;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = undefined;
        }
        lastFrameTimeRef.current = null;
        setDisplayedLength(fullLength);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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

// Re-export old interface name for backwards compatibility
export type TypeWriterConfig = AdaptiveTypeWriterConfig;
