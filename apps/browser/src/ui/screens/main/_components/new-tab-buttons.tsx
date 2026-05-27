import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyActions } from '@shared/hotkeys';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { GlobePlusIcon } from './globe-plus-icon';
import { WindowPlusIcon } from '../terminal-panel/_components/window-plus-icon';

interface NewTabButtonsProps {
  onCreateBrowserTab: () => void;
  onCreateTerminalTab: () => void;
  buttonClassName?: string;
}

export function NewTabButtons({
  onCreateBrowserTab,
  onCreateTerminalTab,
  buttonClassName,
}: NewTabButtonsProps) {
  return (
    <div className="flex shrink-0 flex-row items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open new browser tab"
            className={buttonClassName}
            onClick={onCreateBrowserTab}
          >
            <GlobePlusIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-1.5">
            <span>Open browsing tab</span>
            <HotkeyCombo action={HotkeyActions.NEW_TAB} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Open new terminal tab"
            className={buttonClassName}
            onClick={onCreateTerminalTab}
          >
            <WindowPlusIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="flex items-center gap-1.5">
            <span>Open terminal tab</span>
            <HotkeyCombo action={HotkeyActions.NEW_TERMINAL_TAB} size="xs" />
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
