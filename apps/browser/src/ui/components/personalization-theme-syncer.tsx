import { useLayoutEffect } from 'react';
import { getPersonalizationTheme } from '@shared/personalization-themes';
import { useKartonState } from '@ui/hooks/use-karton';
import { syncThemeColorsToMain } from '@ui/utils/theme-color-sync';

const THEME_TRANSITION_CLASS = 'theme-transitions-enabled';
const THEME_TRANSITION_DURATION_MS = 500;
const THEME_TRANSITION_HALF_DURATION_MS = THEME_TRANSITION_DURATION_MS / 2;

type PersonalizationThemeId = Parameters<typeof getPersonalizationTheme>[0];
type PersonalizationTheme = ReturnType<typeof getPersonalizationTheme>;

let themeTransitionMidpointTimeoutId: number | undefined;
let themeTransitionCleanupTimeoutId: number | undefined;
let themeTransitionTargetThemeId: PersonalizationThemeId | undefined;

function setThemeProperties(root: HTMLElement, theme: PersonalizationTheme) {
  root.style.setProperty('--H-base', String(theme.baseHue));
  root.style.setProperty('--base-chroma-scale', String(theme.baseChromaScale));
  root.style.setProperty('--H-primary', String(theme.primaryHue));
  root.style.setProperty(
    '--primary-chroma-scale',
    String(theme.primaryChromaScale),
  );
  root.style.setProperty('--H', String(theme.primaryHue));
  root.dataset.personalizationTheme = theme.id;
}

function clearThemeTransitionTimeouts() {
  if (themeTransitionMidpointTimeoutId !== undefined) {
    window.clearTimeout(themeTransitionMidpointTimeoutId);
    themeTransitionMidpointTimeoutId = undefined;
  }

  if (themeTransitionCleanupTimeoutId !== undefined) {
    window.clearTimeout(themeTransitionCleanupTimeoutId);
    themeTransitionCleanupTimeoutId = undefined;
  }

  themeTransitionTargetThemeId = undefined;
}

export function applyPersonalizationThemeToRoot(
  themeId: PersonalizationThemeId,
  options: { transition?: boolean } = {},
) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  const theme = getPersonalizationTheme(themeId);

  if (options.transition) {
    clearThemeTransitionTimeouts();

    themeTransitionTargetThemeId = theme.id;
    root.dataset.personalizationTheme = theme.id;
    root.classList.add(THEME_TRANSITION_CLASS);
    root.style.setProperty('--base-chroma-scale', '0');
    root.style.setProperty('--primary-chroma-scale', '0');

    themeTransitionMidpointTimeoutId = window.setTimeout(() => {
      setThemeProperties(root, theme);
      themeTransitionMidpointTimeoutId = undefined;
      window.requestAnimationFrame(syncThemeColorsToMain);
    }, THEME_TRANSITION_HALF_DURATION_MS);

    themeTransitionCleanupTimeoutId = window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
      themeTransitionCleanupTimeoutId = undefined;
      themeTransitionTargetThemeId = undefined;
      window.requestAnimationFrame(syncThemeColorsToMain);
    }, THEME_TRANSITION_DURATION_MS);

    window.requestAnimationFrame(syncThemeColorsToMain);
    return;
  }

  if (themeTransitionTargetThemeId !== undefined) {
    window.requestAnimationFrame(syncThemeColorsToMain);
    return;
  }

  clearThemeTransitionTimeouts();
  root.classList.remove(THEME_TRANSITION_CLASS);
  setThemeProperties(root, theme);
  window.requestAnimationFrame(syncThemeColorsToMain);
}

export function PersonalizationThemeSyncer() {
  const themeId = useKartonState((s) => s.globalConfig.personalizationThemeId);

  useLayoutEffect(() => {
    applyPersonalizationThemeToRoot(themeId);
  }, [themeId]);

  return null;
}
