import { useId, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';

export function BackgroundWithCutout({
  targetElementId = 'dev-app-preview-container',
  className = '',
  borderRadius = 8,
}: {
  targetElementId?: string;
  className?: string;
  borderRadius?: number;
}) {
  const maskId = `cutout-mask-${useId()}`;
  const parentRef = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    parentWidth: number;
    parentHeight: number;
  } | null>(null);

  useLayoutEffect(() => {
    const parentElement = parentRef.current;
    if (!parentElement) return;

    let resizeObserver: ResizeObserver | null = null;
    let targetElement: HTMLElement | null = null;

    const updateBounds = () => {
      const target = document.getElementById(targetElementId);
      const parent = parentRef.current;

      if (!target || !parent) {
        setBounds(null);
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();

      setBounds({
        x: targetRect.x - parentRect.x,
        y: targetRect.y - parentRect.y,
        width: targetRect.width,
        height: targetRect.height,
        parentWidth: parentRect.width,
        parentHeight: parentRect.height,
      });
    };

    const setupObservers = () => {
      targetElement = document.getElementById(targetElementId);

      if (!targetElement) {
        setBounds(null);
        return;
      }

      updateBounds();

      // Setup ResizeObserver for the target element
      resizeObserver = new ResizeObserver(updateBounds);
      resizeObserver.observe(targetElement);
      resizeObserver.observe(parentElement);
    };

    // Initial setup
    setupObservers();

    // Watch for the target element being added/removed from the DOM
    const mutationObserver = new MutationObserver(() => {
      const currentTarget = document.getElementById(targetElementId);

      // If element appeared and we don't have observers set up
      if (currentTarget && !resizeObserver) setupObservers();
      // If element disappeared and we have observers
      else if (!currentTarget && resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
        targetElement = null;
        setBounds(null);
      }
    });

    // Observe the entire document body for changes
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('resize', updateBounds);

    return () => {
      mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();

      window.removeEventListener('resize', updateBounds);
    };
  }, [targetElementId]);

  return (
    <div ref={parentRef} className={cn('absolute inset-0', className)}>
      {bounds && (
        <svg
          width="0"
          height="0"
          className="pointer-events-none absolute"
          style={{ position: 'absolute' }}
        >
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={bounds.parentWidth}
              height={bounds.parentHeight}
            >
              {/* White background - shows orange (use parent dimensions in pixels) */}
              <rect
                x="0"
                y="0"
                width={bounds.parentWidth}
                height={bounds.parentHeight}
                fill="white"
              />
              {/* Black rectangle - hides orange (creates transparent cutout) */}
              <rect
                x={bounds.x}
                y={bounds.y}
                width={bounds.width}
                height={bounds.height}
                rx={borderRadius}
                ry={borderRadius}
                fill="black"
              />
            </mask>
          </defs>
        </svg>
      )}

      <div
        className="absolute inset-0 bg-background"
        style={{
          mask: bounds ? `url(#${maskId})` : undefined,
          WebkitMask: bounds ? `url(#${maskId})` : undefined,
        }}
      />
    </div>
  );
}
