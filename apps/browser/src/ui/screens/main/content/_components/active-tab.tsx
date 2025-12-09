import { useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconXmark } from 'nucleo-micro-bold';
import { WithTabTooltipPreview } from './with-tab-tooltip-preview';
import { TabFavicon } from './tab-favicon';

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
  const tabRef = useRef<HTMLDivElement>(null);
  const clipPathId = `tabClipPath-${useId()}`;

  const dimensions = useElementDimensions(tabRef, [
    activateBottomLeftCornerRadius,
  ]);

  const svgPath = useMemo(() => {
    return getTabSvgPath({
      height: dimensions.height,
      width: dimensions.width,
      borderRadius,
      activateBottomLeftCornerRadius,
    });
  }, [dimensions, borderRadius, activateBottomLeftCornerRadius]);

  return (
    <WithTabTooltipPreview tabState={tabState}>
      <div
        data-state="active"
        className="@container relative w-64 min-w-8 px-2"
      >
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
        <div className="flex items-center gap-2 py-1 pb-1.75 @[40px]:pl-1 pl-0">
          <div className="@[40px]:flex hidden shrink-0 items-center justify-center">
            <TabFavicon tabState={tabState} />
          </div>
          <span className="mt-px @[55px]:block hidden truncate text-foreground text-xs">
            {tabState.title}
          </span>
          <Button
            variant="ghost"
            size="icon-2xs"
            className="ml-auto h-5 shrink-0"
            onClick={onClose}
          >
            <IconXmark className="size-3 text-muted-foreground" />
          </Button>
        </div>
      </div>
    </WithTabTooltipPreview>
  );
}

function useElementDimensions(
  elementRef: React.RefObject<HTMLElement>,
  dependencies: React.DependencyList = [],
) {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const updateDimensions = () => {
      const rect = element.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };
    updateDimensions();
    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementRef, ...dependencies]);
  return dimensions;
}

function getTabSvgPath({
  height,
  width,
  borderRadius,
  activateBottomLeftCornerRadius,
}: {
  height: number;
  width: number;
  borderRadius: number;
  activateBottomLeftCornerRadius: boolean;
}) {
  const turningPoints = {
    bottomLeft: { x: 0, y: height },
    bottomLeftInner: { x: borderRadius, y: height - borderRadius },
    topLeft: { x: borderRadius, y: borderRadius },
    topLeftInner: { x: 2 * borderRadius, y: 0 },
    topRightInner: { x: width - 2 * borderRadius, y: 0 },
    topRight: { x: width - borderRadius, y: borderRadius },
    bottomRightInner: { x: width - borderRadius, y: height - borderRadius },
    bottomRight: { x: width, y: height },
  };
  const p = turningPoints;
  const K = borderRadius * CUBIC_BEZIER_CONTROL_POINT_FACTOR;
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
}
