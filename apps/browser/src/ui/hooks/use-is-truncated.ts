import { type RefObject, useLayoutEffect, useState } from 'react';
import { createRafResizeObserver } from '@ui/utils/resize-observer';

export function useIsTruncated(ref: RefObject<HTMLElement | null>) {
  const [isTruncated, setIsTruncated] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const check = () => {
      setIsTruncated(
        el.isConnected &&
          (el.scrollWidth > el.clientWidth ||
            el.scrollHeight > el.clientHeight),
      );
    };
    check();

    const { observer, disconnect } = createRafResizeObserver(check);
    observer.observe(el);
    return () => disconnect();
  });

  return { isTruncated, tooltipOpen, setTooltipOpen };
}
