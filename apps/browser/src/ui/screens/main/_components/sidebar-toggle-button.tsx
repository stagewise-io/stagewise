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
import {
  IconSidebarLeftHideOutline18,
  IconSidebarLeftShowOutline18,
} from 'nucleo-ui-outline-18';
import { useSidebarCollapsed } from './sidebar-collapsed-context';

export function SidebarToggleButton() {
  const { collapsed, toggle } = useSidebarCollapsed();
  // The optical offset was tuned to align the icon's perceived center
  // with the macOS traffic-light cluster. On Windows/Linux there are no
  // traffic lights to align against, so we skip the nudge and let the
  // icon sit on the flex-center of the titlebar row.
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar';
  const Icon = collapsed
    ? IconSidebarLeftShowOutline18
    : IconSidebarLeftHideOutline18;
  return (
    <Tooltip>
      <TooltipTrigger>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className="app-no-drag shrink-0"
          style={
            isMacOs ? { marginTop: TITLEBAR_ICON_OPTICAL_OFFSET } : undefined
          }
          onClick={toggle}
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label} (<HotkeyComboText action={HotkeyActions.TOGGLE_SIDEBAR} />)
      </TooltipContent>
    </Tooltip>
  );
}
