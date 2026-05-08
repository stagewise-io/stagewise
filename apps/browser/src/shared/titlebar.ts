/**
 * Shared titlebar geometry constants.
 *
 * Single source of truth consumed by both the Electron main process (for
 * `trafficLightPosition`) and the renderer (for the titlebar row that hosts
 * the sidebar toggle button). Keeping these values here guarantees that the
 * OS-drawn traffic lights and the DOM-drawn toggle button never drift apart.
 */

/** Height of the titlebar region in px. */
export const TITLEBAR_HEIGHT = 40;

/** Diameter of a macOS traffic-light button in px (fixed by the OS). */
export const TRAFFIC_LIGHT_HEIGHT = 12;

/** Reserved horizontal space for the macOS traffic-light cluster in px. */
export const TRAFFIC_LIGHT_GUTTER_WIDTH = 78;

/** X offset passed to Electron's `trafficLightPosition`. */
export const MACOS_TRAFFIC_LIGHT_X = 14;

/** Derived Y offset passed to Electron's `trafficLightPosition`. */
export const MACOS_TRAFFIC_LIGHT_Y =
  (TITLEBAR_HEIGHT - TRAFFIC_LIGHT_HEIGHT) / 2;

/**
 * Optical Y-offset for the sidebar toggle icon. The icon glyph is top-heavy
 * (the "tab" notch pulls visual weight upward), so flex-centering puts its
 * geometric center on the traffic-light center but its optical center above.
 * Nudging it down by a few pixels aligns the perceived centers.
 */
export const TITLEBAR_ICON_OPTICAL_OFFSET = 3;
