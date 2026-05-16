import { HotkeyActions } from '@shared/hotkeys';
import { TITLEBAR_ICON_OPTICAL_OFFSET } from '@shared/titlebar';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyComboText } from '@ui/components/hotkey-combo-text';
import { useKartonState } from '@ui/hooks/use-karton';
import { useUiZoomCounterScale } from '@ui/hooks/use-ui-zoom-counter-scale';
import { IconSidebarLeftOutline18 } from 'nucleo-ui-outline-18';
import { useSidebarCollapsed } from './sidebar-collapsed-context';

export function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebarCollapsed();
  // The optical offset was tuned to align the icon's perceived center
  // with the macOS traffic-light cluster. On Windows/Linux there are no
  // traffic lights to align against, so we skip the nudge and let the
  // icon sit on the flex-center of the titlebar row.
  // Counter-scaled so the offset stays correct under UI zoom.
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const counterScale = useUiZoomCounterScale();
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar';
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="app-no-drag shrink-0"
          style={
            isMacOs
              ? { marginTop: TITLEBAR_ICON_OPTICAL_OFFSET * counterScale }
              : undefined
          }
          onClick={toggle}
        >
          <IconSidebarLeftOutline18 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} (<HotkeyComboText action={HotkeyActions.TOGGLE_SIDEBAR} />)
      </TooltipContent>
    </Tooltip>
  );
}
