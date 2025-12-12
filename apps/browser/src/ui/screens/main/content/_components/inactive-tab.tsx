import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconXmark } from 'nucleo-micro-bold';
import type { TabState } from '@shared/karton-contracts/ui';
import { TabFavicon } from './tab-favicon';
import { WithTabTooltipPreview } from './with-tab-tooltip-preview';
import { IconVolumeUpFill18, IconVolumeXmarkFill18 } from 'nucleo-ui-fill-18';

export function InactiveTab({
  tabState,
  onClick,
  onClose,
  showRightSeparator = true,
  onToggleAudioMuted,
}: {
  onClick: () => void;
  onClose: () => void;
  onToggleAudioMuted: () => void;
  showRightSeparator?: boolean;
  tabState: TabState;
}) {
  return (
    <WithTabTooltipPreview tabState={tabState}>
      <div
        data-state={'inactive'}
        className={cn(
          `@container flex h-7.25 w-64 min-w-8 items-center gap-2 self-start rounded-[8.5px] px-2 py-1 transition-colors hover:bg-zinc-50/70 has-[+[data-state="active"]]:rounded-br-md [[data-state="active"]+&]:rounded-bl-md`,
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
        <span className="mt-px @[55px]:block hidden truncate text-foreground text-xs">
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
              <IconVolumeUpFill18 className="size-3 text-muted-foreground" />
            ) : (
              <IconVolumeXmarkFill18 className="size-3 text-rose-600" />
            )}
          </Button>
        )}
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
