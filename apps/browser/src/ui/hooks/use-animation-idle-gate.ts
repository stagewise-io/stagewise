import { useEffect } from 'react';

/**
 * Toggles the `app-idle` class on `<html>` when the window loses focus or the
 * page becomes hidden. The CSS rule `.app-idle * { animation-play-state: paused
 * !important }` pauses all infinite CSS animations, allowing the GPU/compositor
 * to enter low-power states while the app is not visible.
 *
 * Animations resume from their current frame when focus is restored.
 */
export function useAnimationIdleGate(): void {
  useEffect(() => {
    const root = document.documentElement;

    const update = () => {
      const isIdle =
        !document.hasFocus() || document.visibilityState !== 'visible';
      root.classList.toggle('app-idle', isIdle);
    };

    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    document.addEventListener('visibilitychange', update);
    update();

    return () => {
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      document.removeEventListener('visibilitychange', update);
      root.classList.remove('app-idle');
    };
  }, []);
}
