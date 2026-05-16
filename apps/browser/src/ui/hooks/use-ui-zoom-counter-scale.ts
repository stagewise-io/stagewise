import { useMemo } from 'react';
import { useKartonState } from './use-karton';

/**
 * Returns the inverse zoom factor for counter-scaling elements that must
 * remain at native pixel size regardless of the UI zoom level.
 *
 * CSS `zoom` scales EVERYTHING including layout boxes, but the macOS
 * traffic lights are OS-drawn at native pixel positions. Elements that
 * align against them (traffic light gutter, titlebar row, toggle button)
 * need to be counter-scaled so their rendered pixel dimensions match the
 * native OS chrome.
 *
 * Usage: multiply native pixel values by this factor.
 *
 *   style={{ height: TITLEBAR_HEIGHT * counterScale }}
 */
export function useUiZoomCounterScale(): number {
  const uiZoomPercentage = useKartonState(
    (s) => s.preferences.general.uiZoomPercentage,
  );
  return useMemo(() => 100 / uiZoomPercentage, [uiZoomPercentage]);
}
