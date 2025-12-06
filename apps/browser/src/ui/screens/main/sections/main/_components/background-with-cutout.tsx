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
    const targetElement = document.getElementById(targetElementId);
    const parentElement = parentRef.current;

    if (!targetElement || !parentElement) {
      setBounds(null);
      return;
    }

    const updateBounds = () => {
      const targetRect = targetElement.getBoundingClientRect();
      const parentRect = parentElement.getBoundingClientRect();

      setBounds({
        x: targetRect.x - parentRect.x,
        y: targetRect.y - parentRect.y,
        width: targetRect.width,
        height: targetRect.height,
        parentWidth: parentRect.width,
        parentHeight: parentRect.height,
      });
    };

    updateBounds();

    const observer = new ResizeObserver(updateBounds);
    observer.observe(targetElement);
    observer.observe(parentElement);

    window.addEventListener('resize', updateBounds);

    return () => {
      observer.disconnect();
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
