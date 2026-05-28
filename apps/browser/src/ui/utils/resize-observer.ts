export const RESIZE_OBSERVER_LOOP_ERROR_MESSAGES = new Set([
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
]);

export function isResizeObserverLoopError(value: unknown): boolean {
  if (typeof value === 'string') {
    return RESIZE_OBSERVER_LOOP_ERROR_MESSAGES.has(value);
  }

  if (value instanceof Error) {
    return RESIZE_OBSERVER_LOOP_ERROR_MESSAGES.has(value.message);
  }

  if (
    value &&
    typeof value === 'object' &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return RESIZE_OBSERVER_LOOP_ERROR_MESSAGES.has(value.message);
  }

  return false;
}

export function containsResizeObserverLoopError(
  value: unknown,
  depth = 0,
): boolean {
  if (isResizeObserverLoopError(value)) return true;
  if (!value || typeof value !== 'object' || depth >= 3) return false;

  if (Array.isArray(value)) {
    return value.some((item) =>
      containsResizeObserverLoopError(item, depth + 1),
    );
  }

  return Object.values(value).some((item) =>
    containsResizeObserverLoopError(item, depth + 1),
  );
}

export function createRafResizeObserver(callback: ResizeObserverCallback) {
  let frameId: number | null = null;
  let latestEntries: ResizeObserverEntry[] = [];
  let latestObserver: ResizeObserver | null = null;

  const observer = new ResizeObserver((entries, resizeObserver) => {
    latestEntries = entries;
    latestObserver = resizeObserver;

    if (frameId !== null) return;

    frameId = requestAnimationFrame(() => {
      frameId = null;
      callback(latestEntries, latestObserver ?? observer);
    });
  });

  return {
    observer,
    disconnect() {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
      observer.disconnect();
    },
  };
}
