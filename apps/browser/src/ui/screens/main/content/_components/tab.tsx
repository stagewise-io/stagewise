import { useLayoutEffect, useMemo, useRef, useState, useId } from 'react';
import type { TabState } from '@shared/karton-contracts/ui';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';

import { WithTabPreviewCard } from './with-tab-preview-card';
import { TabFavicon } from './tab-favicon';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';
import { IconXmark } from 'nucleo-micro-bold';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { useTabUIState } from '@/hooks/use-tab-ui-state';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyComboText } from '@/components/hotkey-combo-text';

const CUBIC_BEZIER_CONTROL_POINT_FACTOR = 0.5522847498;

function s(...path: string[]) {
  return path.join(' ');
}

export function Tab({
  borderRadius = 8,
  bottomLeftBorderRadius,
  className = '',
  activateBottomLeftCornerRadius = true,
  tabState,
  isDragging = false,
}: {
  borderRadius?: number;
  /** Optional override for just the bottom-left S-curve radius (used during drag interpolation) */
  bottomLeftBorderRadius?: number;
  className?: string;
  activateBottomLeftCornerRadius?: boolean;
  tabState: TabState;
  /** Whether this tab is currently being dragged */
  isDragging?: boolean;
}) {
  // Use the override if provided, otherwise use the general borderRadius
  const effectiveBottomLeftRadius = bottomLeftBorderRadius ?? borderRadius;
  const tabs = useKartonState((s) => s.browser.tabs);
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const isActive = tabState.id === activeTabId;
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const togglePanelKeyboardFocus = useKartonProcedure(
    (p) => p.browser.layout.togglePanelKeyboardFocus,
  );
  const { tabUiState } = useTabUIState();

  const handleClick = async () => {
    if (isActive) return;
    const focus = tabUiState[tabState.id]?.focusedPanel ?? 'stagewise-ui';
    await switchTab(tabState.id);
    void togglePanelKeyboardFocus(focus);
  };

  // Calculate if this tab should show right separator
  // (show if not active and not left of active tab)
  const shouldShowRightSeparator = useMemo(() => {
    if (isActive) return false;
    const tabIds = Object.keys(tabs);
    const currentIndex = tabIds.findIndex((id) => id === tabState.id);
    const activeIndex = tabIds.findIndex((id) => id === activeTabId);
    return currentIndex !== activeIndex - 1;
  }, [isActive, tabs, tabState.id, activeTabId]);

  const tabRef = useRef<HTMLDivElement>(null);
  const clipPathId = `tabClipPath-${useId()}`;

  const dimensions = useElementDimensions(tabRef, [
    activateBottomLeftCornerRadius,
    isActive,
    borderRadius,
    effectiveBottomLeftRadius,
  ]);

  const svgPath = useMemo(() => {
    if (!isActive) return '';
    return getTabSvgPath({
      height: dimensions.height,
      width: dimensions.width,
      borderRadius,
      bottomLeftBorderRadius: effectiveBottomLeftRadius,
      activateBottomLeftCornerRadius,
    });
  }, [
    dimensions,
    borderRadius,
    effectiveBottomLeftRadius,
    activateBottomLeftCornerRadius,
    isActive,
  ]);

  return (
    <WithTabPreviewCard tabState={tabState} activeTabId={activeTabId}>
      <div
        data-state={isActive ? 'active' : 'inactive'}
        className={cn(
          '@container w-full px-2',
          isActive
            ? 'relative h-8'
            : cn(
                'mb-0.75 flex h-7.25 items-center gap-2 self-start rounded-[8.5px] py-1 transition-colors hover:bg-surface-2 has-[+[data-state="active"]]:rounded-br-md dark:hover:bg-base-850 [[data-state="active"]+&]:rounded-bl-md',
                isDragging && 'bg-surface-2 dark:bg-base-850',
                shouldShowRightSeparator &&
                  'after:-right-[2px] after:absolute after:h-4 after:border-surface-2 after:border-r after:content-[""]',
              ),
        )}
        onClick={isActive ? undefined : handleClick}
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
                paddingLeft: activateBottomLeftCornerRadius
                  ? effectiveBottomLeftRadius
                  : 0,
                marginLeft: activateBottomLeftCornerRadius
                  ? -effectiveBottomLeftRadius
                  : 0,
                paddingRight: borderRadius,
                marginRight: -borderRadius,
                borderTopLeftRadius: borderRadius,
                borderTopRightRadius: borderRadius,
              }}
            />
          </>
        )}
        {/* Shared tab content */}
        <TabContent isActive={isActive} tabState={tabState} />
      </div>
    </WithTabPreviewCard>
  );
}

function TabContent({
  isActive,
  tabState,
}: {
  isActive: boolean;
  tabState: TabState;
}) {
  const tabs = useKartonState((s) => s.browser.tabs);
  const closeTab = useKartonProcedure((p) => p.browser.closeTab);
  const toggleAudioMuted = useKartonProcedure(
    (p) => p.browser.toggleAudioMuted,
  );
  const { removeTabUiState } = useTabUIState();

  const handleClose = () => {
    closeTab(tabState.id);
    removeTabUiState(tabState.id);
  };

  const handleToggleAudioMuted = () => {
    toggleAudioMuted(tabState.id);
  };

  const shouldHideCloseButton = useMemo(() => {
    const isOnlyTab = Object.keys(tabs).length === 1;
    const isInternalPage =
      tabState.url?.startsWith('stagewise://internal/') ?? false;
    return isOnlyTab && isInternalPage;
  }, [tabs, tabState.url]);
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
      <span className="mt-px @[55px]:block hidden flex-1 truncate font-regular text-foreground text-xs">
        {tabState.title}
      </span>
      {(tabState.isPlayingAudio || tabState.isMuted) && (
        <Button
          variant="ghost"
          size="icon-2xs"
          onClick={handleToggleAudioMuted}
          className={cn(
            'shrink-0',
            tabState.isMuted
              ? 'text-error hover:text-error-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {!tabState.isMuted ? (
            <IconVolumeUpFill18
              className={cn('size-3', !isActive && 'text-muted-foreground')}
            />
          ) : (
            <IconVolumeXmarkFill18
              className={cn('size-3', !isActive && 'text-error-foreground')}
            />
          )}
        </Button>
      )}
      {!shouldHideCloseButton && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-2xs"
              className={cn(
                'ml-auto shrink-0 text-muted-foreground hover:text-foreground',
                !isActive && '@[40px]:flex hidden',
              )}
              onClick={handleClose}
            >
              <IconXmark className="size-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span>
              Close (<HotkeyComboText action={HotkeyActions.CTRL_W} />)
            </span>
            <br />
            <span className="text-muted-foreground/70">
              {' '}
              Close all other (
              <HotkeyComboText action={HotkeyActions.CTRL_SHIFT_W} />)
            </span>
          </TooltipContent>
        </Tooltip>
      )}
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
  bottomLeftBorderRadius,
  activateBottomLeftCornerRadius,
}: {
  height: number;
  width: number;
  borderRadius: number;
  /** Separate radius for the bottom-left S-curve (for drag interpolation) */
  bottomLeftBorderRadius: number;
  activateBottomLeftCornerRadius: boolean;
}) {
  // Use the separate bottomLeftBorderRadius for the bottom-left S-curve
  const blRadius = bottomLeftBorderRadius;

  const turningPoints = {
    // Bottom-left S-curve uses its own radius
    bottomLeft: { x: 0, y: height },
    bottomLeftInner: { x: blRadius, y: height - blRadius },
    topLeft: { x: blRadius, y: borderRadius },
    // Top-left curve: starts at x=blRadius (where bottom-left ends), uses borderRadius for its width
    topLeftInner: { x: blRadius + borderRadius, y: 0 },
    // Rest of the tab uses the standard borderRadius
    topRightInner: { x: width - 2 * borderRadius, y: 0 },
    topRight: { x: width - borderRadius, y: borderRadius },
    bottomRightInner: { x: width - borderRadius, y: height - borderRadius },
    bottomRight: { x: width, y: height },
  };
  const p = turningPoints;
  const K = borderRadius * CUBIC_BEZIER_CONTROL_POINT_FACTOR;
  const Kbl = blRadius * CUBIC_BEZIER_CONTROL_POINT_FACTOR; // Control point for bottom-left curve

  const bottomLeftUntilTopRightInner =
    activateBottomLeftCornerRadius === false
      ? s(
          `M ${p.bottomLeft.x} ${p.bottomLeft.y}`, // Start at bottom left corner
          `L ${p.topLeft.x - blRadius} ${p.topLeft.y}`, // Move to top left corner
          `C ${p.topLeft.x - blRadius} ${p.topLeft.y - K}, ${p.topLeftInner.x - blRadius - K} ${p.topLeftInner.y}, ${p.topLeftInner.x - blRadius} ${p.topLeftInner.y}`, // Curve to top left inner
          `L ${p.topRightInner.x} ${p.topRightInner.y}`, // Move to top right inner corner
        )
      : s(
          `M ${p.bottomLeft.x} ${p.bottomLeft.y}`, // Start at bottom left corner
          `C ${p.bottomLeft.x + Kbl} ${p.bottomLeft.y}, ${p.bottomLeftInner.x} ${p.bottomLeftInner.y + Kbl}, ${p.bottomLeftInner.x} ${p.bottomLeftInner.y}`, // Curve to bottom left inner (uses blRadius)
          `L ${p.topLeft.x} ${p.topLeft.y}`, // Move to top left corner
          `C ${p.topLeft.x} ${p.topLeft.y - K}, ${p.topLeftInner.x - K} ${p.topLeftInner.y}, ${p.topLeftInner.x} ${p.topLeftInner.y}`, // Curve to top left inner (uses standard radius for top-left curve)
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
