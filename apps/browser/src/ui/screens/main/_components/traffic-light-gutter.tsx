import { TITLEBAR_HEIGHT, TRAFFIC_LIGHT_GUTTER_WIDTH } from '@shared/titlebar';
import { useKartonState } from '@ui/hooks/use-karton';
import { useUiZoomCounterScale } from '@ui/hooks/use-ui-zoom-counter-scale';

/**
 * Reserves horizontal space for macOS traffic-light window controls (hidden
 * titlebar). Used inside the sidebar titlebar row so the toggle button lands
 * at the same x-position whether the sidebar is open or collapsed.
 *
 * Dimensions are counter-scaled against the global UI zoom so the gutter
 * stays aligned with the OS-drawn traffic lights regardless of zoom level.
 */
export function TrafficLightGutter() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);
  const counterScale = useUiZoomCounterScale();
  if (!isMacOs || isFullScreen) return null;
  return (
    <div
      className="app-drag shrink-0"
      style={{
        height: TITLEBAR_HEIGHT * counterScale,
        width: TRAFFIC_LIGHT_GUTTER_WIDTH * counterScale,
      }}
    />
  );
}
