import { useEffect, useRef, useState } from 'react';
import { PERSONALIZATION_THEMES } from '@shared/personalization-themes';
import type { PersonalizationThemeId } from '@shared/karton-contracts/ui/shared-types';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { applyPersonalizationThemeToRoot } from '@ui/components/personalization-theme-syncer';

/**
 * Shared state management for personalization theme selection.
 * Used by both the onboarding theme step and the settings personalization
 * section to avoid drift in save/rollback behavior.
 */
export function useThemeSelection() {
  const persistedThemeId = useKartonState(
    (s) => s.globalConfig.personalizationThemeId,
  );
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const track = useTrack();
  const latestSaveRequestIdRef = useRef(0);
  const latestRequestedThemeIdRef = useRef<PersonalizationThemeId | undefined>(
    undefined,
  );
  const [currentThemeId, setCurrentThemeId] = useState(persistedThemeId);
  const currentThemeIdRef = useRef(persistedThemeId);
  const persistedThemeIdRef = useRef(persistedThemeId);
  persistedThemeIdRef.current = persistedThemeId;

  const setCurrentTheme = (themeId: PersonalizationThemeId) => {
    currentThemeIdRef.current = themeId;
    setCurrentThemeId(themeId);
  };

  useEffect(() => {
    const latestRequestedThemeId = latestRequestedThemeIdRef.current;

    if (latestRequestedThemeId !== undefined) {
      if (persistedThemeId !== latestRequestedThemeId) {
        return;
      }

      latestRequestedThemeIdRef.current = undefined;
    }

    setCurrentTheme(persistedThemeId);
  }, [persistedThemeId]);

  const handleThemeChange = async (value: unknown) => {
    if (
      typeof value !== 'string' ||
      !PERSONALIZATION_THEMES.some((theme) => theme.id === value)
    ) {
      return;
    }

    const nextThemeId = value as PersonalizationThemeId;
    const previousThemeId = currentThemeIdRef.current;

    if (nextThemeId === previousThemeId) {
      return;
    }

    const saveRequestId = latestSaveRequestIdRef.current + 1;
    latestSaveRequestIdRef.current = saveRequestId;
    latestRequestedThemeIdRef.current = nextThemeId;

    setCurrentTheme(nextThemeId);
    applyPersonalizationThemeToRoot(nextThemeId, { transition: true });

    try {
      await setGlobalConfig({
        personalizationThemeId: nextThemeId,
      });
      track('changed-theme', { theme: nextThemeId });
    } catch (error) {
      if (latestSaveRequestIdRef.current !== saveRequestId) {
        return;
      }

      latestRequestedThemeIdRef.current = undefined;
      const groundTruth = persistedThemeIdRef.current;
      setCurrentTheme(groundTruth);
      applyPersonalizationThemeToRoot(groundTruth, { transition: true });
      console.error('Failed to save personalization theme', error);
    }
  };

  return {
    currentThemeId,
    handleThemeChange,
  };
}
