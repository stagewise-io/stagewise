import { IconMinus, IconPlus } from 'nucleo-micro-bold';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconMagnifierOutline18 } from 'nucleo-ui-outline-18';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import {
  Collapsible,
  CollapsibleContent,
} from '@stagewise/stage-ui/components/collapsible';

export function ZoomBar() {
  const activeTabId = useKartonState((s) => s.browser.activeTabId);
  const zoomPercentage = useKartonState(
    (s) => s.browser.tabs[activeTabId]?.zoomPercentage,
  );
  const setZoomPercentage = useKartonProcedure(
    (p) => p.browser.setZoomPercentage,
  );

  const [isHovered, setIsHovered] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animationTimerRef = useRef<NodeJS.Timeout | null>(null);

  const zoomOut = useCallback(() => {
    if (zoomPercentage <= 50) {
      return;
    }
    setZoomPercentage(zoomPercentage - 10, activeTabId);
  }, [zoomPercentage, setZoomPercentage, activeTabId]);

  const zoomIn = useCallback(() => {
    if (zoomPercentage >= 500) {
      return;
    }
    setZoomPercentage(zoomPercentage + 10, activeTabId);
  }, [zoomPercentage, setZoomPercentage, activeTabId]);

  const resetZoom = useCallback(() => {
    setZoomPercentage(100, activeTabId);
  }, [setZoomPercentage, activeTabId]);

  // Handle auto-hide logic
  useEffect(() => {
    // Clear any existing timers
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (animationTimerRef.current) {
      clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }

    // Show if zoom is not 100%
    if (zoomPercentage !== 100) {
      if (!shouldShow) {
        // Component is not showing, animate in
        setShouldShow(true);
      }
      return;
    }

    // If zoom is 100% and mouse is not hovering, start hide timer
    if (zoomPercentage === 100 && !isHovered) {
      hideTimerRef.current = setTimeout(() => {
        setShouldShow(false);
      }, 1500);
    }

    // Cleanup timers on unmount
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (animationTimerRef.current) {
        clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
    };
  }, [zoomPercentage, isHovered, shouldShow]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (!shouldShow) {
      setShouldShow(true);
    }
  }, [shouldShow]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  if (!zoomPercentage) {
    return null;
  }

  return (
    <Collapsible open={shouldShow}>
      <CollapsibleContent
        className="h-8 w-[calc-size(auto,size)] rounded-full bg-zinc-500/5 pr-1.5 pl-2.5 text-base opacity-100 blur-none transition-all duration-150 ease-out data-ending-style:h-8! data-starting-style:h-8! data-ending-style:w-0 data-starting-style:w-0 data-ending-style:overflow-hidden data-starting-style:overflow-hidden data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:blur-sm data-starting-style:blur-sm"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex h-full flex-row items-center gap-2">
          <IconMagnifierOutline18 className="block size-4 text-muted-foreground opacity-50" />

          <div className="flex flex-row items-center gap-0">
            <Button variant="ghost" size="icon-xs" onClick={zoomOut}>
              <IconMinus className="size-3.5" />
            </Button>
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" size="xs" onClick={resetZoom}>
                  {zoomPercentage}%
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset zoom</TooltipContent>
            </Tooltip>
            <Button variant="ghost" size="icon-xs" onClick={zoomIn}>
              <IconPlus className="size-3.5" />
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
