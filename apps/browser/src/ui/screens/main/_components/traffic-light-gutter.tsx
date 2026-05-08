import { TITLEBAR_HEIGHT, TRAFFIC_LIGHT_GUTTER_WIDTH } from '@shared/titlebar';
import { useKartonState } from '@ui/hooks/use-karton';

/**
 * Reserves horizontal space for macOS traffic-light window controls (hidden
 * titlebar). Used inside the sidebar titlebar row so the toggle button lands
 * at the same x-position whether the sidebar is open or collapsed.
 */
export function TrafficLightGutter() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  if (!isMacOs || isFullScreen) return null;
  return (
    <div
      className="app-drag shrink-0"
      style={{
        height: TITLEBAR_HEIGHT,
        width: TRAFFIC_LIGHT_GUTTER_WIDTH,
      }}
    />
  );
}
