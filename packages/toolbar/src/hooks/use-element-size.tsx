import { useCallback, useEffect, useState } from "preact/hooks";

export function useElementSize(node: HTMLElement | null) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const handleSize = useCallback(() => {
    if (node) {
      setSize({
        width: node?.offsetWidth ?? 0,
        height: node?.offsetHeight ?? 0,
      });
    }
  }, [node]);

  useEffect(() => {
    if (!node) return;

    handleSize();

    const resizeObserver = new ResizeObserver(handleSize);
    resizeObserver.observe(node);

    return () => resizeObserver.disconnect();
  }, [node, handleSize]);

  return size;
}
