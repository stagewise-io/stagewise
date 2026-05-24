import {
  TITLEBAR_HEIGHT,
  TITLEBAR_ICON_OPTICAL_OFFSET,
} from '@shared/titlebar';
import { cn } from '@ui/utils';
import { useUiZoomCounterScale } from '@ui/hooks/use-ui-zoom-counter-scale';
import { SidebarToggleButton } from './sidebar-toggle-button';
import { TrafficLightGutter } from './traffic-light-gutter';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { HotkeyCombo } from '@ui/components/hotkey-combo';
import { HotkeyActions } from '@shared/hotkeys';
import { IconPenPlusOutline18 } from 'nucleo-ui-outline-18';
import { useKartonState } from '@ui/hooks/use-karton';

/**
 * Titlebar row containing the macOS traffic-light gutter and the sidebar
 * toggle button. Rendered inside the sidebar when open, and overlaid at the
 * top-left of the agent-chat panel when the sidebar is collapsed, so the
 * toggle button stays at the same screen position in both states.
 *
 * When the sidebar is collapsed, an additional "new chat" icon-only button
 * and the current chat title are shown inline after the toggle button.
 *
 * Vertical centering is done via flexbox against `TITLEBAR_HEIGHT`, which is
 * the same constant that drives `trafficLightPosition.y` in the main process
 * — so the toggle button and the macOS traffic lights cannot drift apart.
 *
 * Height and the optical sub-pixel nudge are counter-scaled so they stay
 * aligned with the OS-drawn traffic lights regardless of UI zoom.
 */
export function SidebarTitlebarRow({
  absolute = false,
  sidebarCollapsed = false,
  agentTitle,
  onCreateChat,
}: {
  absolute?: boolean;
  sidebarCollapsed?: boolean;
  agentTitle?: string;
  onCreateChat?: () => void;
}) {
  const counterScale = useUiZoomCounterScale();
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  return (
    <div
      style={{
        height: TITLEBAR_HEIGHT * counterScale,
        // Sub-pixel nudge: flex-centering puts our icons' geometric center on
        // the traffic-light center, but AA + icon-grid rounding makes them
        // read as ~0.5px too high. A CSS transform is the only way to express
        // a fractional offset — `marginTop` would round on non-Retina. Applied
        // at the container so any future icons added to this row inherit the
        // same optical alignment without per-icon tweaks.
        transform: `translateY(${0.5 * counterScale}px)`,
      }}
      className={cn(
        'flex shrink-0 items-center gap-0.5',
        absolute && 'absolute inset-x-0 top-0 z-10',
      )}
    >
      <TrafficLightGutter />
      <div className="ml-0.5 shrink-0">
        <SidebarToggleButton />
      </div>
      {sidebarCollapsed && onCreateChat && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="New chat"
              className="app-no-drag shrink-0"
              style={
                isMacOs
                  ? { marginTop: TITLEBAR_ICON_OPTICAL_OFFSET }
                  : undefined
              }
              onClick={onCreateChat}
            >
              <IconPenPlusOutline18 className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <span className="flex items-center gap-1.5">
              <span>New chat</span>
              <HotkeyCombo action={HotkeyActions.NEW_CHAT} size="xs" />
            </span>
          </TooltipContent>
        </Tooltip>
      )}
      {sidebarCollapsed && agentTitle && (
        <span
          className="app-no-drag ml-2 select-none truncate font-medium text-foreground text-sm"
          style={
            isMacOs ? { marginTop: TITLEBAR_ICON_OPTICAL_OFFSET } : undefined
          }
        >
          {agentTitle}
        </span>
      )}
    </div>
  );
}
