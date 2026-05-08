import { TITLEBAR_HEIGHT } from '@shared/titlebar';
import { cn } from '@ui/utils';
import { SidebarToggleButton } from './sidebar-toggle-button';
import { TrafficLightGutter } from './traffic-light-gutter';

/**
 * Titlebar row containing the macOS traffic-light gutter and the sidebar
 * toggle button. Rendered inside the sidebar when open, and overlaid at the
 * top-left of the agent-chat panel when the sidebar is collapsed, so the
 * toggle button stays at the same screen position in both states.
 *
 * Vertical centering is done via flexbox against `TITLEBAR_HEIGHT`, which is
 * the same constant that drives `trafficLightPosition.y` in the main process
 * — so the toggle button and the macOS traffic lights cannot drift apart.
 */
export function SidebarTitlebarRow({
  absolute = false,
}: {
  absolute?: boolean;
}) {
  return (
    <div
      style={{
        height: TITLEBAR_HEIGHT,
        // Sub-pixel nudge: flex-centering puts our icons' geometric center on
        // the traffic-light center, but AA + icon-grid rounding makes them
        // read as ~0.5px too high. A CSS transform is the only way to express
        // a fractional offset — `marginTop` would round on non-Retina. Applied
        // at the container so any future icons added to this row inherit the
        // same optical alignment without per-icon tweaks.
        transform: 'translateY(0.5px)',
      }}
      className={cn(
        'flex shrink-0 items-center gap-1',
        absolute && 'absolute inset-x-0 top-0 z-10',
      )}
    >
      <TrafficLightGutter />
      <SidebarToggleButton />
      {/* Trailing drag region: fills the rest of the row so the area right
          of the toggle button remains a window grab handle (matches the
          pre-collapse sidebar behavior where the whole titlebar was
          draggable). `shrink-0` + `flex-1` gives it all remaining width. */}
      <div aria-hidden className="app-drag min-h-full flex-1" />
    </div>
  );
}
