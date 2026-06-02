import { useEffect, useRef, useState } from 'react';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  PERSONALIZATION_THEMES,
  getPersonalizationTheme,
} from '@shared/personalization-themes';
import type { PersonalizationThemeId } from '@shared/karton-contracts/ui/shared-types';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { applyPersonalizationThemeToRoot } from '@ui/components/personalization-theme-syncer';
import { produceWithPatches, enablePatches } from 'immer';
import { NotificationsSetting } from './general-settings-section';

enablePatches();

function UiSizeSetting() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const uiZoomPercentage = preferences.general.uiZoomPercentage;

  const handleUiSizeChange = async (value: number) => {
    const nextValue = Math.max(70, Math.min(130, Math.round(value)));
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.general.uiZoomPercentage = nextValue;
    });
    await updatePreferences(patches);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-base text-foreground">UI size</h3>
          <p className="text-muted-foreground text-sm">
            Scale the stagewise interface independently from web page zoom.
          </p>
        </div>
        <span className="shrink-0 rounded-md bg-surface-1 px-2 py-1 font-medium text-foreground text-sm">
          {uiZoomPercentage}%
        </span>
      </div>

      <div className="w-full max-w-sm space-y-1 pl-2">
        <Slider
          value={uiZoomPercentage}
          min={70}
          max={130}
          step={5}
          ariaLabel="UI size"
          thickness="default"
          onValueChange={handleUiSizeChange}
        />
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>Small</span>
          <span>Default</span>
          <span>Large</span>
        </div>
      </div>
    </div>
  );
}

function baseColor(
  lightness: number,
  chroma: number,
  themeId: PersonalizationThemeId,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.baseChromaScale} ${
    theme.baseHue
  })`;
}

function primaryColor(
  lightness: number,
  chroma: number,
  themeId: PersonalizationThemeId,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.primaryChromaScale} ${
    theme.primaryHue
  })`;
}

function ThemeBadge({ themeId }: { themeId: PersonalizationThemeId }) {
  return (
    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-muted-foreground/10">
      <span
        className="absolute inset-0 rounded-lg dark:opacity-0"
        style={{
          backgroundColor: baseColor(0.92, 0.002, themeId),
        }}
      />
      <span
        className="absolute inset-0 rounded-lg opacity-0 dark:opacity-100"
        style={{
          backgroundColor: baseColor(0.295, 0.0015, themeId),
        }}
      />
      <span
        className="relative size-5 rounded-sm dark:opacity-0"
        style={{
          backgroundColor: primaryColor(0.5455, 0.25, themeId),
        }}
      />
      <span
        className="absolute size-5 rounded-sm opacity-0 dark:opacity-100"
        style={{
          backgroundColor: primaryColor(0.62, 0.23, themeId),
        }}
      />
    </span>
  );
}

function ThemeSetting() {
  const persistedThemeId = useKartonState(
    (s) => s.globalConfig.personalizationThemeId,
  );
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const latestSaveRequestIdRef = useRef(0);
  const [currentThemeId, setCurrentThemeId] = useState(persistedThemeId);

  useEffect(() => {
    setCurrentThemeId(persistedThemeId);
  }, [persistedThemeId]);

  const handleThemeChange = async (value: unknown) => {
    if (
      typeof value !== 'string' ||
      !PERSONALIZATION_THEMES.some((theme) => theme.id === value)
    ) {
      return;
    }

    const nextThemeId = value as PersonalizationThemeId;
    const previousThemeId = currentThemeId;

    if (nextThemeId === previousThemeId) {
      return;
    }

    const saveRequestId = latestSaveRequestIdRef.current + 1;
    latestSaveRequestIdRef.current = saveRequestId;

    setCurrentThemeId(nextThemeId);
    applyPersonalizationThemeToRoot(nextThemeId, { transition: true });

    try {
      await setGlobalConfig({
        personalizationThemeId: nextThemeId,
      });
    } catch (error) {
      if (latestSaveRequestIdRef.current !== saveRequestId) {
        return;
      }

      setCurrentThemeId(previousThemeId);
      applyPersonalizationThemeToRoot(previousThemeId, { transition: true });
      console.error('Failed to save personalization theme', error);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-base text-foreground">Theme colors</h3>
        <p className="text-muted-foreground text-sm">
          Choose a predefined color system. Theme changes transition smoothly
          across surfaces, text, and controls.
        </p>
      </div>

      <div className="flex flex-wrap gap-3" role="radiogroup">
        {PERSONALIZATION_THEMES.map((theme) => {
          const active = theme.id === currentThemeId;
          return (
            <button
              key={theme.id}
              type="button"
              className={cn(
                'group flex w-18 flex-col items-center gap-1.5 rounded-lg p-1.5 transition-colors',
                'hover:bg-hover-derived active:bg-active-derived',
                active && 'bg-surface-1',
              )}
              onClick={() => handleThemeChange(theme.id)}
              aria-checked={active}
              aria-label={`Use ${theme.name} theme`}
              role="radio"
              title={theme.name}
            >
              <span
                className={cn(
                  'rounded-[calc(var(--radius-lg)+1px)] p-px transition-[box-shadow,background-color]',
                  active && 'bg-primary-solid',
                )}
              >
                <ThemeBadge themeId={theme.id} />
              </span>
              <span
                className={cn(
                  'max-w-16 truncate text-center text-muted-foreground text-xs',
                  active && 'font-medium text-foreground',
                )}
              >
                {theme.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PersonalizationSettingsSection() {
  return (
    <div className="h-full w-full">
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          <div>
            <h1 className="font-semibold text-foreground text-xl">
              Personalization
            </h1>
          </div>

          <section className="space-y-6">
            <UiSizeSetting />
          </section>

          <hr className="border-derived-subtle border-t" />

          <section className="space-y-6">
            <ThemeSetting />
          </section>

          <hr className="border-derived-subtle border-t" />

          <section className="space-y-6">
            <NotificationsSetting />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}
