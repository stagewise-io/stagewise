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
  alpha?: number,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.baseChromaScale} ${
    theme.baseHue
  }${alpha === undefined ? '' : ` / ${alpha}`})`;
}

function primaryColor(
  lightness: number,
  chroma: number,
  themeId: PersonalizationThemeId,
  alpha?: number,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.primaryChromaScale} ${
    theme.primaryHue
  }${alpha === undefined ? '' : ` / ${alpha}`})`;
}

function ThemeBadge({
  themeId,
  name,
  active,
}: {
  themeId: PersonalizationThemeId;
  name: string;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        'relative flex h-16 w-32 shrink-0 items-start justify-end overflow-hidden rounded-lg p-2 ring-1 ring-muted-foreground/20 transition-opacity',
        active ? 'opacity-100 ring-foreground/30' : 'opacity-60',
      )}
    >
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
        className="absolute -bottom-5 -left-5 h-[4.6875rem] w-[5.625rem] rounded-full dark:opacity-0"
        style={{
          background: `linear-gradient(to bottom left, ${primaryColor(
            0.49,
            0.22,
            themeId,
          )}, ${primaryColor(0.7, 0.18, themeId)})`,
          filter: 'blur(12px)',
        }}
      />
      <span
        className="absolute -bottom-8 -left-10 h-[4.6875rem] w-[5.625rem] rounded-full opacity-0 dark:opacity-100"
        style={{
          background: `linear-gradient(to bottom left, ${primaryColor(
            0.49,
            0.22,
            themeId,
          )}, ${primaryColor(0.7, 0.18, themeId)})`,
          filter: 'blur(20px)',
        }}
      />
      <span
        className="relative z-10 max-w-20 truncate text-right font-normal text-foreground text-sm"
        style={{
          textShadow: `0 0 2px ${baseColor(0.92, 0.002, themeId, 0.5)}`,
        }}
      >
        {name}
      </span>
    </span>
  );
}

function ThemeSetting() {
  const persistedThemeId = useKartonState(
    (s) => s.globalConfig.personalizationThemeId,
  );
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const latestSaveRequestIdRef = useRef(0);
  const latestRequestedThemeIdRef = useRef<PersonalizationThemeId | undefined>(
    undefined,
  );
  const [currentThemeId, setCurrentThemeId] = useState(persistedThemeId);
  const currentThemeIdRef = useRef(persistedThemeId);

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
    } catch (error) {
      if (latestSaveRequestIdRef.current !== saveRequestId) {
        return;
      }

      latestRequestedThemeIdRef.current = undefined;
      setCurrentTheme(previousThemeId);
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
              className="group rounded-lg"
              onClick={() => handleThemeChange(theme.id)}
              aria-checked={active}
              aria-label={`Use ${theme.name} theme`}
              role="radio"
              title={theme.name}
            >
              <ThemeBadge
                themeId={theme.id}
                name={theme.name}
                active={active}
              />
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
