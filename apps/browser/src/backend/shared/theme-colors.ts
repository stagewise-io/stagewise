/**
 * Shared theme colors used throughout the application.
 * These colors are used for window backgrounds and webcontents backgrounds
 * to ensure consistent theming across light and dark modes.
 *
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Run "pnpm generate:theme-colors" in packages/stage-ui to regenerate.
 * Source: packages/stage-ui/src/palette.css and theme.css
 */

/**
 * Default background color for web content views.
 * This matches real browser behavior (Chrome/Chromium) where pages without
 * an explicit background color display on a white canvas.
 */
export const WEB_CONTENT_DEFAULT_BACKGROUND = '#ffffff';

export const THEME_COLORS = {
  light: {
    background: '#d3d8e1', // theme.css: --color-app-background → --color-base-200
    titleBarOverlay: {
      color: '#d3d8e1', // theme.css: --color-app-background → --color-base-200
      symbolColor: '#14161a', // theme.css: --color-foreground → --color-base-900
    },
  },
  dark: {
    background: '#0c0d10', // theme.css: --color-app-background → --color-base-950
    titleBarOverlay: {
      color: '#0c0d10', // theme.css: --color-app-background → --color-base-950
      symbolColor: '#d3d8e1', // theme.css: --color-foreground → --color-base-200
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
