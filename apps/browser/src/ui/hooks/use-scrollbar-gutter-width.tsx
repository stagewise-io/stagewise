import { useEffect, useState } from 'react';

/**
 * Measures the space reserved by `scrollbar-gutter: stable`.
 * Returns 0 for overlay scrollbars (macOS with trackpad), > 0 for classic scrollbars.
 */
export function getScrollbarGutterWidth(): number {
  // Create two identical elements, one with scrollbar-gutter: stable, one without
  const withGutter = document.createElement('div');
  withGutter.style.cssText =
    'visibility:hidden;position:absolute;width:100px;overflow:auto;scrollbar-gutter:stable';

  const withoutGutter = document.createElement('div');
  withoutGutter.style.cssText =
    'visibility:hidden;position:absolute;width:100px;overflow:auto';

  // Add inner content to both
  const inner1 = document.createElement('div');
  const inner2 = document.createElement('div');
  withGutter.appendChild(inner1);
  withoutGutter.appendChild(inner2);

  document.body.appendChild(withGutter);
  document.body.appendChild(withoutGutter);

  // The gutter width is the difference in inner content width
  const gutterWidth = inner2.offsetWidth - inner1.offsetWidth;

  withGutter.parentNode?.removeChild(withGutter);
  withoutGutter.parentNode?.removeChild(withoutGutter);

  return gutterWidth;
}

/**
 * Hook that returns the scrollbar gutter width reserved by `scrollbar-gutter: stable`.
 * Returns 0 for overlay scrollbars, > 0 for classic scrollbars.
 * Re-measures on focus with brief polling to catch delayed macOS scrollbar type changes.
 *
 * @example
 * ```tsx
 * const scrollbarGutterWidth = useScrollbarGutterWidth();
 * const basePadding = 16; // px-4
 * const rightPadding = Math.max(0, basePadding - scrollbarGutterWidth);
 *
 * <div style={{ paddingLeft: basePadding, paddingRight: rightPadding, scrollbarGutter: 'stable' }}>
 *   ...
 * </div>
 * ```
 */
export function useScrollbarGutterWidth(): number {
  const [gutterWidth, setGutterWidth] = useState(() =>
    getScrollbarGutterWidth(),
  );

  useEffect(() => {
    let pollTimeouts: ReturnType<typeof setTimeout>[] = [];

    const measureAndUpdate = () => {
      const newWidth = getScrollbarGutterWidth();
      setGutterWidth((prev) => (prev !== newWidth ? newWidth : prev));
    };

    const handleFocus = () => {
      // Clear any existing poll timeouts
      for (const t of pollTimeouts) clearTimeout(t);
      pollTimeouts = [];

      // Measure immediately + poll briefly to catch delayed macOS scrollbar changes
      measureAndUpdate();
      pollTimeouts.push(setTimeout(measureAndUpdate, 100));
      pollTimeouts.push(setTimeout(measureAndUpdate, 500));
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      for (const t of pollTimeouts) clearTimeout(t);
    };
  }, []);

  return gutterWidth;
}
