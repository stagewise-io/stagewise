/**
 * Shared theme colors used throughout the application.
 * These colors are used for window backgrounds and webcontents backgrounds
 * to ensure consistent theming across light and dark modes.
 */
export const THEME_COLORS = {
  light: {
    background: '#e4e4e7',
    titleBarOverlay: {
      color: '#e4e4e7',
      symbolColor: '#3f3f46',
    },
  },
  dark: {
    background: '#18181b',
    titleBarOverlay: {
      color: '#18181b',
      symbolColor: '#d4d4d8',
    },
  },
} as const;

/**
 * Get the background color for the current theme.
 * @param isDark - Whether dark mode is active
 * @returns The background color hex code
 */
export function getBackgroundColor(isDark: boolean): string {
  return isDark ? THEME_COLORS.dark.background : THEME_COLORS.light.background;
}
