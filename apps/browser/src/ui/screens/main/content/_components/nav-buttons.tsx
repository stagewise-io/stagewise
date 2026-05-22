import { HotkeyActions } from '@shared/hotkeys';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowRotateAnticlockwise,
} from 'nucleo-micro-bold';
import { IconMediaStopFill18 } from 'nucleo-ui-fill-18';
import type { TabState } from '@shared/karton-contracts/ui';
import { HotkeyCombo } from '@ui/components/hotkey-combo';

interface NavButtonsProps {
  tabId: string;
  tab: TabState | undefined;
}

export function NavButtons({ tabId, tab }: NavButtonsProps) {
  const goBack = useKartonProcedure((p) => p.browser.goBack);
  const goForward = useKartonProcedure((p) => p.browser.goForward);
  const reload = useKartonProcedure((p) => p.browser.reload);
  const stop = useKartonProcedure((p) => p.browser.stop);

  const isLoading = tab?.isLoading ?? false;
  const canGoBack = tab?.navigationHistory.canGoBack ?? false;
  const canGoForward = tab?.navigationHistory.canGoForward ?? false;

  return (
    <div className="flex flex-row items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                disabled={!canGoBack}
                className={!canGoBack ? 'pointer-events-none' : undefined}
                onClick={() => {
                  goBack(tabId);
                }}
              >
                <IconArrowLeft
                  className={canGoBack ? 'size-4' : 'size-4 opacity-50'}
                />
              </Button>
            </span>
          }
        />
        <TooltipContent>
          <span className="flex items-center gap-1.5">
            <span>Back</span>
            <HotkeyCombo action={HotkeyActions.HISTORY_BACK} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Forward"
                disabled={!canGoForward}
                className={!canGoForward ? 'pointer-events-none' : undefined}
                onClick={() => {
                  goForward(tabId);
                }}
              >
                <IconArrowRight
                  className={canGoForward ? 'size-4' : 'size-4 opacity-50'}
                />
              </Button>
            </span>
          }
        />
        <TooltipContent>
          <span className="flex items-center gap-1.5">
            <span>Forward</span>
            <HotkeyCombo action={HotkeyActions.HISTORY_FORWARD} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
      {isLoading ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Stop loading"
          onClick={() => {
            stop(tabId);
          }}
        >
          <IconMediaStopFill18 className="size-3.5" />
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Reload"
              onClick={() => {
                reload(tabId);
              }}
            >
              <IconArrowRotateAnticlockwise className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span className="flex items-center gap-1.5">
              <span>Reload</span>
              <HotkeyCombo action={HotkeyActions.RELOAD} size="xs" />
            </span>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
