import {
  PreviewCard,
  PreviewCardContent,
  PreviewCardTrigger,
} from '@stagewise/stage-ui/components/preview-card';
import type { TabState } from '@shared/karton-contracts/ui';
import { type ReactElement, useEffect, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconLinkFill18 } from 'nucleo-ui-fill-18';

export function WithTabPreviewCard({
  tabState,
  children,
  activeTabId,
}: {
  tabState: TabState;
  children: ReactElement;
  activeTabId: string;
}) {
  const isActive = tabState.id === activeTabId;
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [tabState.screenshot]);

  return (
    <PreviewCard>
      <PreviewCardTrigger delay={10} closeDelay={10}>
        {children}
      </PreviewCardTrigger>
      {!tabState.url?.startsWith('stagewise://internal/') && (
        <PreviewCardContent
          className="flex w-64 flex-col items-stretch gap-2"
          sideOffset={isActive ? 0 : 2}
        >
          {(tabState.screenshot?.length ?? 0) > 0 && (
            <>
              <img
                src={tabState.screenshot}
                className="hidden"
                alt="Preview of the tab"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(false)}
              />
              {imageLoaded && (
                <div className="flex min-h-24 w-full items-center justify-center overflow-hidden rounded-sm bg-muted ring-1 ring-muted-foreground/20">
                  <img
                    src={tabState.screenshot}
                    className="max-h-36 max-w-full object-contain"
                    alt="Preview of the tab"
                  />
                </div>
              )}
            </>
          )}
          <div className="flex flex-row items-start justify-between gap-2">
            <span className="mt-1 font-medium text-foreground text-xs">
              {tabState.title}
            </span>
            <div className="flex flex-row gap-0.5">
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy current URL"
                    onClick={() => navigator.clipboard.writeText(tabState.url)}
                  >
                    <IconLinkFill18 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Copy URL</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </PreviewCardContent>
      )}
    </PreviewCard>
  );
}
