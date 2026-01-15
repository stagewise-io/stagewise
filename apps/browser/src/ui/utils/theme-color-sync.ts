/**
 * Theme Color Sync Utility
 *
 * Syncs computed CSS theme colors to the Electron main process during dev mode.
 * This enables live updates of the window background when CSS palette variables change.
 *
 * The sync happens:
 * 1. On initial app load
 * 2. After Vite CSS HMR updates
 */

/**
 * Convert any CSS color value to hex format using a canvas.
 * This reliably handles OKLCH, RGB, HSL, and any other CSS color format
 * by letting the browser do the conversion via canvas fillStyle.
 */
function cssColorToHex(cssColor: string): string {
  // Handle empty or invalid input
  if (!cssColor || cssColor === 'transparent') {
    return '#00000000';
  }

  // If it's already a hex color, return it
  if (cssColor.startsWith('#')) {
    return cssColor;
  }

  // Use a canvas to convert any CSS color to RGB
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('[ThemeColorSync] Could not create canvas context');
    return '#000000';
  }

  // Set the fill style to the CSS color - browser converts it internally
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);

  // Read back the pixel data as RGBA
  const imageData = ctx.getImageData(0, 0, 1, 1);
  const r = imageData.data[0] ?? 0;
  const g = imageData.data[1] ?? 0;
  const b = imageData.data[2] ?? 0;

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Get a computed CSS variable value as a hex color.
 * Uses canvas-based conversion to handle OKLCH and other modern color formats.
 */
function getComputedThemeColor(varName: string): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();

  if (!value) {
    console.warn(`[ThemeColorSync] CSS variable ${varName} not found`);
    return '#000000';
  }

  return cssColorToHex(value);
}

/**
 * Check if the current color scheme is dark mode.
 */
function isDarkMode(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sync the current theme colors to the main process.
 * Only runs in development mode.
 */
export function syncThemeColorsToMain(): void {
  // Only sync in dev mode
  if (!import.meta.env.DEV) {
    return;
  }

  // Check if electron bridge is available
  if (typeof window.electron?.syncThemeColors !== 'function') {
    console.warn(
      '[ThemeColorSync] window.electron.syncThemeColors not available',
    );
    return;
  }

  const isDark = isDarkMode();

  const theme = {
    background: getComputedThemeColor('--color-app-background'),
    titleBarOverlay: {
      color: getComputedThemeColor('--color-app-background'),
      symbolColor: getComputedThemeColor('--color-foreground'),
    },
  };

  console.log(
    `[ThemeColorSync] Syncing ${isDark ? 'dark' : 'light'} theme colors:`,
    theme,
  );

  window.electron.syncThemeColors({ isDark, theme });
}

/**
 * Initialize theme color sync with HMR support.
 * Call this once at app startup.
 */
export function initThemeColorSync(): void {
  // Only run in dev mode
  if (!import.meta.env.DEV) {
    return;
  }

  // Initial sync after a short delay to ensure CSS is loaded
  setTimeout(() => {
    syncThemeColorsToMain();
  }, 100);

  // Listen for color scheme changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', () => {
    syncThemeColorsToMain();
  });

  // Hook into Vite HMR for CSS updates
  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', (payload) => {
      // Check if any CSS was updated - Vite may send CSS as either:
      // 1. type: 'css-update' (direct CSS HMR)
      // 2. type: 'js-update' with a .css path (CSS imported as module)
      const hasCssUpdate = payload.updates?.some(
        (update: { type: string; path?: string; acceptedPath?: string }) =>
          update.type === 'css-update' ||
          (update.type === 'js-update' &&
            (update.path?.endsWith('.css') ||
              update.acceptedPath?.endsWith('.css'))),
      );

      if (hasCssUpdate) {
        // Small delay to ensure CSS is applied
        setTimeout(() => {
          syncThemeColorsToMain();
        }, 50);
      }
    });

    console.log('[ThemeColorSync] HMR listener registered');
  }
}
