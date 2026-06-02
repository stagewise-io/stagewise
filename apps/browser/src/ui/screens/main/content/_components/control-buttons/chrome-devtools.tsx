import { HotkeyActions } from '@shared/hotkeys';
import { useKartonProcedure } from '@ui/hooks/use-karton';
import { IconSquareCodeOutline18 } from 'nucleo-ui-outline-18';
import type { TabState } from '@shared/karton-contracts/ui';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyCombo } from '@ui/components/hotkey-combo';

export function ChromeDevToolsWidget({ tab }: { tab: TabState }) {
  const toggleChromeDevTools = useKartonProcedure(
    (p) => p.browser.devTools.chrome.toggle,
  );

  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            tab.devTools.chromeOpen ? 'Hide DevTools' : 'Show DevTools'
          }
          onClick={() => toggleChromeDevTools(tab.id)}
          className={
            'text-muted-foreground data-[active=true]:text-primary-solid data-[active=true]:hover:text-primary-solid'
          }
          data-active={tab.devTools.chromeOpen ? 'true' : 'false'}
        >
          <IconSquareCodeOutline18 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="flex items-center gap-1.5">
          <span>
            {tab.devTools.chromeOpen ? 'Hide DevTools' : 'Show DevTools'}
          </span>
          <HotkeyCombo action={HotkeyActions.DEV_TOOLS} size="xs" />
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
