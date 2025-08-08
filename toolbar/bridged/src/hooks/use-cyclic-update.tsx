// This hook is used to call a configured function cyclically with the given frame rate.
// If no frame rate is given, it will default to trigger the function every repaint (requestAnimationFrame).
// If a frame rate of 0 is set, the update call will never be made.

import { useCallback, useEffect, useMemo, useRef } from 'react';

export function useCyclicUpdate(func: () => void, frameRate?: number) {
  const animationFrameHandle = useRef<number | undefined>(undefined);

  const timeBetweenFrames = useMemo(
    () => (frameRate && frameRate > 0 ? 1000 / frameRate : 0),
    [frameRate],
  );

  const lastCallFrameTime = useRef<number>(0);

  const update = useCallback(
    (frameTime: number) => {
      if (frameTime - lastCallFrameTime.current >= timeBetweenFrames) {
        func();
        lastCallFrameTime.current = frameTime;
      }

      animationFrameHandle.current = requestAnimationFrame(update);
    },
    [func, timeBetweenFrames],
  );

  useEffect(() => {
    if (!frameRate || frameRate > 0) {
      animationFrameHandle.current = requestAnimationFrame(update);
    }

    return () => {
      if (animationFrameHandle.current) {
        cancelAnimationFrame(animationFrameHandle.current);
        animationFrameHandle.current = undefined;
      }
    };
  }, [frameRate, update]);
}
