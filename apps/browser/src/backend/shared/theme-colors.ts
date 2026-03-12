/**
 * Shared theme colors used throughout the application.
 * These colors are used for window backgrounds and webcontents backgrounds
 * to ensure consistent theming across light and dark modes.
 *
 * AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
 * Run "pnpm generate:theme-colors" in packages/stage-ui to regenerate.
 * Source: packages/stage-ui/src/palette.css and theme.css
 */

export const THEME_COLORS = {
  light: {
    background: '#e5e4e3', // theme.css: --color-app-background → --color-base-150
    titleBarOverlay: {
      color: '#e5e4e3', // theme.css: --color-app-background → --color-base-150
      symbolColor: '#161515', // theme.css: --color-foreground → --color-base-900
    },
  },
  dark: {
    background: '#0d0d0d', // theme.css: --color-app-background → --color-base-950
    titleBarOverlay: {
      color: '#0d0d0d', // theme.css: --color-app-background → --color-base-950
      symbolColor: '#d8d7d6', // theme.css: --color-foreground → --color-base-200
    },
  },
} as const;
