import { useLayoutEffect } from 'react';
import { getPersonalizationTheme } from '@shared/personalization-themes';
import { useKartonState } from '@ui/hooks/use-karton';
import { syncThemeColorsToMain } from '@ui/utils/theme-color-sync';

const THEME_TRANSITION_CLASS = 'theme-transitions-enabled';
const THEME_TRANSITION_DURATION_MS = 1000;

let themeTransitionTimeoutId: ReturnType<typeof window.setTimeout> | undefined;

export function applyPersonalizationThemeToRoot(
  themeId: Parameters<typeof getPersonalizationTheme>[0],
  options: { transition?: boolean } = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const theme = getPersonalizationTheme(themeId);

  root.style.setProperty('--H-base', String(theme.baseHue));
  root.style.setProperty('--base-chroma-scale', String(theme.baseChromaScale));
  root.style.setProperty('--H-primary', String(theme.primaryHue));
  root.style.setProperty(
    '--primary-chroma-scale',
    String(theme.primaryChromaScale),
  );
  root.style.setProperty('--H', String(theme.primaryHue));
  root.dataset.personalizationTheme = theme.id;

  if (options.transition) {
    if (themeTransitionTimeoutId !== undefined) {
      window.clearTimeout(themeTransitionTimeoutId);
    }

    root.classList.add(THEME_TRANSITION_CLASS);
    themeTransitionTimeoutId = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      themeTransitionTimeoutId = undefined;
    }, THEME_TRANSITION_DURATION_MS);
  } else if (themeTransitionTimeoutId === undefined) {
    root.classList.remove(THEME_TRANSITION_CLASS);
  }

  window.requestAnimationFrame(syncThemeColorsToMain);
}

export function PersonalizationThemeSyncer() {
  const themeId = useKartonState((s) => s.globalConfig.personalizationThemeId);

  useLayoutEffect(() => {
    applyPersonalizationThemeToRoot(themeId);
  }, [themeId]);

  return null;
}
