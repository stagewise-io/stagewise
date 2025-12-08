import { useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconXmark } from 'nucleo-micro-bold';

const CUBIC_BEZIER_CONTROL_POINT_FACTOR = 0.5522847498;

function s(...path: string[]) {
  return path.join(' ');
}

export function ActiveTab({
  borderRadius = 8,
  className = '',
  activateBottomLeftCornerRadius = true,
  tabState,
  onClose,
}: {
  borderRadius?: number;
  className?: string;
  activateBottomLeftCornerRadius?: boolean;
  tabState: TabState;
  onClose: () => void;
}) {
  // Coefficient for cubic bezier control points
  const K = borderRadius * CUBIC_BEZIER_CONTROL_POINT_FACTOR;
  const tabRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const clipPathId = `tabClipPath-${useId()}`;

  useLayoutEffect(() => {
    const element = tabRef.current;
    if (!element) return;

    // Initial measurement
    const updateDimensions = () => {
      const rect = element.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height,
      });
    };
    // Measure initially
    updateDimensions();
    // Set up ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Force dimension recalculation when props that affect size change
  useLayoutEffect(() => {
    const element = tabRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setDimensions({
      width: rect.width,
      height: rect.height,
    });
  }, [activateBottomLeftCornerRadius, borderRadius]);

  const turningPoints = useMemo(() => {
    return {
      bottomLeft: { x: 0, y: dimensions.height },
      bottomLeftInner: { x: borderRadius, y: dimensions.height - borderRadius },
      topLeft: { x: borderRadius, y: borderRadius },
      topLeftInner: { x: 2 * borderRadius, y: 0 },
      topRightInner: { x: dimensions.width - 2 * borderRadius, y: 0 },
      topRight: { x: dimensions.width - borderRadius, y: borderRadius },
      bottomRightInner: {
        x: dimensions.width - borderRadius,
        y: dimensions.height - borderRadius,
      },
      bottomRight: { x: dimensions.width, y: dimensions.height },
    };
  }, [dimensions, borderRadius]);

  const p = useMemo(() => {
    return turningPoints;
  }, [turningPoints]);

  const svgPath = useMemo(() => {
    const bottomLeftUntilTopRightInner =
      activateBottomLeftCornerRadius === false
        ? s(
            `M ${p.bottomLeft.x} ${p.bottomLeft.y}`, // Start at bottom left corner
            `L ${p.topLeft.x - borderRadius} ${p.topLeft.y}`, // Move to top left corner
            `C ${p.topLeft.x - borderRadius} ${p.topLeft.y - K}, ${p.topLeftInner.x - borderRadius - K} ${p.topLeftInner.y}, ${p.topLeftInner.x - borderRadius} ${p.topLeftInner.y}`, // Curve to top left inner
            `L ${p.topRightInner.x} ${p.topRightInner.y}`, // Move to top right inner corner
          )
        : s(
            `M ${p.bottomLeft.x} ${p.bottomLeft.y}`, // Start at bottom left corner
            `C ${p.bottomLeft.x + K} ${p.bottomLeft.y}, ${p.bottomLeftInner.x} ${p.bottomLeftInner.y + K}, ${p.bottomLeftInner.x} ${p.bottomLeftInner.y}`, // Curve to bottom left inner
            `L ${p.topLeft.x} ${p.topLeft.y}`, // Move to top left corner
            `C ${p.topLeft.x} ${p.topLeft.y - K}, ${p.topLeftInner.x - K} ${p.topLeftInner.y}, ${p.topLeftInner.x} ${p.topLeftInner.y}`, // Curve to top left inner
            `L ${p.topRightInner.x} ${p.topRightInner.y}`, // Move to top right inner corner
          );
    return s(
      bottomLeftUntilTopRightInner,
      `C ${p.topRightInner.x + K} ${p.topRightInner.y}, ${p.topRight.x} ${p.topRight.y - K}, ${p.topRight.x} ${p.topRight.y}`, // Curve to top right
      `L ${p.bottomRightInner.x} ${p.bottomRightInner.y}`, // Move to bottom right inner corner
      `C ${p.bottomRightInner.x} ${p.bottomRightInner.y + K}, ${p.bottomRight.x - K} ${p.bottomRight.y}, ${p.bottomRight.x} ${p.bottomRight.y}`, // Curve to bottom right corner
      `Z`,
    );
  }, [p, K]);

  return (
    <>
      {/* SVG definitions - hidden but accessible */}
      <svg
        width="0"
        height="0"
        className="absolute"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <clipPath id={clipPathId} clipPathUnits="userSpaceOnUse">
            <path d={svgPath} fill="white" />
          </clipPath>
        </defs>
      </svg>
      {/* Active tab content */}
      <div className="relative w-40 px-2">
        <div
          ref={tabRef}
          className={cn(
            `absolute inset-0 block bg-background ${dimensions.width > 0 ? 'opacity-100' : 'opacity-0'}`,
            className,
          )}
          style={{
            clipPath: `url(#${clipPathId})`,
            paddingLeft: activateBottomLeftCornerRadius ? borderRadius : 0,
            marginLeft: activateBottomLeftCornerRadius ? -borderRadius : 0,
            paddingRight: borderRadius,
            marginRight: -borderRadius,
            borderTopLeftRadius: borderRadius,
            borderTopRightRadius: borderRadius,
          }}
        />
        <div className="flex items-center gap-2 py-1 pb-1.75 pl-1">
          <img
            src={tabState.faviconUrls[0]}
            alt={tabState.title}
            className="size-4 shrink-0"
          />
          <span className="truncate text-foreground text-sm">
            {tabState.title}
          </span>
          <Button
            variant="ghost"
            size="icon-2xs"
            className="ml-auto shrink-0"
            onClick={onClose}
          >
            <IconXmark className="size-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </>
  );
}
