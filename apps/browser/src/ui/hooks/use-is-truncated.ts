import { type RefObject, useLayoutEffect, useState } from 'react';

export function useIsTruncated(ref: RefObject<HTMLElement | null>) {
  const [isTruncated, setIsTruncated] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      setIsTruncated(el.isConnected && el.scrollWidth > el.clientWidth);
    };
    check();

    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  });

  return { isTruncated, tooltipOpen, setTooltipOpen };
}
