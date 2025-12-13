import { useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';

import { WithTabTooltipPreview } from './with-tab-tooltip-preview';
import { TabFavicon } from './tab-favicon';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';
import { IconXmark } from 'nucleo-micro-bold';

const CUBIC_BEZIER_CONTROL_POINT_FACTOR = 0.5522847498;

function s(...path: string[]) {
  return path.join(' ');
}

export function Tab({
  isActive,
  borderRadius = 8,
  className = '',
  activateBottomLeftCornerRadius = true,
  showRightSeparator = true,
  tabState,
  onClick,
  onClose,
  onToggleAudioMuted,
}: {
  isActive: boolean;
  borderRadius?: number;
  className?: string;
  activateBottomLeftCornerRadius?: boolean;
  showRightSeparator?: boolean;
  tabState: TabState;
  onClick?: () => void;
  onClose: () => void;
  onToggleAudioMuted: () => void;
}) {
  const tabRef = useRef<HTMLDivElement>(null);
  const clipPathId = `tabClipPath-${useId()}`;

  const dimensions = useElementDimensions(tabRef, [
    activateBottomLeftCornerRadius,
    isActive,
  ]);

  const svgPath = useMemo(() => {
    if (!isActive) return '';
    return getTabSvgPath({
      height: dimensions.height,
      width: dimensions.width,
      borderRadius,
      activateBottomLeftCornerRadius,
    });
  }, [dimensions, borderRadius, activateBottomLeftCornerRadius, isActive]);

  return (
    <WithTabTooltipPreview tabState={tabState}>
      <div
        data-state={isActive ? 'active' : 'inactive'}
        className={cn(
          '@container w-64 min-w-8',
          isActive
            ? 'relative px-2'
            : cn(
                'flex h-7.25 items-center gap-2 self-start rounded-[8.5px] px-2 py-1 transition-colors hover:bg-zinc-50/70 has-[+[data-state="active"]]:rounded-br-md [[data-state="active"]+&]:rounded-bl-md',
                showRightSeparator &&
                  'after:-right-[2px] after:absolute after:h-4 after:border-muted-foreground/20 after:border-r after:content-[""]',
              ),
        )}
        onClick={isActive ? undefined : onClick}
      >
        {/* SVG definitions and background mask for active tab */}
        {isActive && (
          <>
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
          </>
        )}
        {/* Shared tab content */}
        <TabContent
          isActive={isActive}
          tabState={tabState}
          onClose={onClose}
          onToggleAudioMuted={onToggleAudioMuted}
        />
      </div>
    </WithTabTooltipPreview>
  );
}

function TabContent({
  isActive,
  tabState,
  onClose,
  onToggleAudioMuted,
}: {
  isActive: boolean;
  tabState: TabState;
  onClose: () => void;
  onToggleAudioMuted: () => void;
}) {
  const content = (
    <>
      <div
        className={cn(
          'shrink-0 items-center justify-center',
          isActive ? '@[40px]:flex hidden' : '@[40px]:ml-1 ml-0 flex h-5',
        )}
      >
        <TabFavicon tabState={tabState} />
      </div>
      <span className="mt-px @[55px]:block hidden flex-1 truncate text-foreground text-xs">
        {tabState.title}
      </span>
      {(tabState.isPlayingAudio || tabState.isMuted) && (
        <Button
          variant="ghost"
          size="icon-2xs"
          onClick={onToggleAudioMuted}
          className={cn(
            'shrink-0',
            tabState.isMuted
              ? 'text-rose-500 hover:text-rose-800'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {!tabState.isMuted ? (
            <IconVolumeUpFill18
              className={cn('size-3', !isActive && 'text-muted-foreground')}
            />
          ) : (
            <IconVolumeXmarkFill18
              className={cn('size-3', !isActive && 'text-rose-600')}
            />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-2xs"
        className={cn(
          'ml-auto shrink-0 text-muted-foreground hover:text-foreground',
          !isActive && '@[40px]:flex hidden',
        )}
        onClick={onClose}
      >
        <IconXmark className="size-3" />
      </Button>
    </>
  );

  if (isActive) {
    return (
      <div className="flex h-8 items-center gap-2 py-1 pb-1.75 @[40px]:pl-1 pl-0">
        {content}
      </div>
    );
  }

  return content;
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
