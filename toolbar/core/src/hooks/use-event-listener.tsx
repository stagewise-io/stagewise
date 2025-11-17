import { useEffect } from 'react';

export function useEventListener(
  eventName: string,
  handler: (...opts: any) => void,
  options?: AddEventListenerOptions,
  element: HTMLElement | Window | null | undefined = window,
  enabled = true,
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!element) return;
    if (!enabled) return;
    element.addEventListener(eventName, handler, options);
    return () => {
      try {
        element.removeEventListener(eventName, handler, options);
      } catch {
        // ignore
      }
    };
  }, [eventName, handler, element, options, enabled]);
}
