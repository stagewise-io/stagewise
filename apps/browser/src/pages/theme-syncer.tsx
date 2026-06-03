import { useEffect } from 'react';
import { useKartonState } from './hooks/use-karton';

export function ThemeSyncer() {
  const appColorScheme = useKartonState(
    (s) => s.globalConfig.appColorScheme ?? 'system',
  );

  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      const isDark =
        appColorScheme === 'dark' ||
        (appColorScheme === 'system' &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);

      root.classList.toggle('dark', isDark);
    };

    applyTheme();

    if (appColorScheme !== 'system') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', applyTheme);

    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [appColorScheme]);

  return null;
}
