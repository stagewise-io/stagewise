import { useEffect } from 'preact/hooks';

export function useEventListener(
  eventName: string,
  handler: (...opts: any) => void,
  options?: AddEventListenerOptions,
  element: HTMLElement | Window | null | undefined = window,
) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!element) return;
    element.addEventListener(eventName, handler, options);
    return () => element.removeEventListener(eventName, handler, options);
  }, [eventName, handler, element, options]);
}
