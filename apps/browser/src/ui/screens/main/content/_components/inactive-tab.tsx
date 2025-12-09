import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconXmark } from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';
import { TabFavicon } from './tab-favicon';
import { WithTabTooltipPreview } from './with-tab-tooltip-preview';

export function InactiveTab({
  tabState,
  onClick,
  onClose,
  showRightSeparator = true,
}: {
  onClick: () => void;
  onClose: () => void;
  showRightSeparator?: boolean;
  tabState: TabState;
}) {
  return (
    <WithTabTooltipPreview tabState={tabState}>
      <div
        data-state={'inactive'}
        className={cn(
          `@container flex w-64 min-w-8 items-center gap-2 self-start rounded-[8.5px] px-2 py-1 transition-colors hover:bg-zinc-50/70 has-[+[data-state="active"]]:rounded-br-md [[data-state="active"]+&]:rounded-bl-md`,
          showRightSeparator &&
            'after:-right-[2px] after:absolute after:h-4 after:border-muted-foreground/20 after:border-r after:content-[""]',
        )}
        onClick={onClick}
      >
        {
          <div className="@[40px]:ml-1 ml-0 flex h-5 shrink-0 items-center justify-center">
            <TabFavicon tabState={tabState} />
          </div>
        }
        <span className="@[55px]:block hidden truncate text-foreground text-xs">
          {tabState.title}
        </span>
        <Button
          variant="ghost"
          size="icon-2xs"
          className="ml-auto @[40px]:flex hidden shrink-0"
          onClick={onClose}
        >
          <IconXmark className="size-3 text-muted-foreground" />
        </Button>
      </div>
    </WithTabTooltipPreview>
  );
}
