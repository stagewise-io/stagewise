import { useRef, useState, useEffect } from 'react';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { Select } from '@stagewise/stage-ui/components/select';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { PERSONALIZATION_THEMES } from '@shared/personalization-themes';
import type { AppColorScheme } from '@shared/karton-contracts/ui/shared-types';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useThemeSelection } from '@ui/hooks/use-theme-selection';
import { ThemeBadge } from '@ui/components/theme-badge';
import { produceWithPatches, enablePatches } from 'immer';
import { NotificationsSetting } from './general-settings-section';

enablePatches();

function UiSizeSetting() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((p) => p.preferences.update);
  const uiZoomPercentage = preferences.general.uiZoomPercentage;
  const [localUiZoomPercentage, setLocalUiZoomPercentage] =
    useState(uiZoomPercentage);
  const commitTimeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setLocalUiZoomPercentage(uiZoomPercentage);
  }, [uiZoomPercentage]);

  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current !== undefined) {
        window.clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  const commitUiSizeChange = (value: number) => {
    const nextValue = Math.max(70, Math.min(130, Math.round(value)));
    const previousValue = preferences.general.uiZoomPercentage;

    if (commitTimeoutRef.current !== undefined) {
      window.clearTimeout(commitTimeoutRef.current);
    }

    commitTimeoutRef.current = window.setTimeout(async () => {
      commitTimeoutRef.current = undefined;

      if (nextValue === preferences.general.uiZoomPercentage) {
        return;
      }

      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general.uiZoomPercentage = nextValue;
      });

      try {
        await updatePreferences(patches);
      } catch (error) {
        setLocalUiZoomPercentage(previousValue);
        console.error('Failed to save UI size preference', error);
      }
    }, 10);
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-medium text-base text-foreground">UI size</h3>
        <p className="text-muted-foreground text-sm">
          Scale the stagewise interface independently from web page zoom.
        </p>
      </div>

      <div className="w-36 space-y-1">
        <Slider
          value={localUiZoomPercentage}
          min={70}
          max={130}
          step={5}
          ariaLabel="UI size"
          thickness="default"
          onValueChange={setLocalUiZoomPercentage}
          onValueCommitted={commitUiSizeChange}
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

const APP_COLOR_SCHEME_ITEMS: {
  value: AppColorScheme;
  label: string;
}[] = [
  {
    value: 'system',
    label: 'System',
  },
  {
    value: 'light',
    label: 'Light',
  },
  {
    value: 'dark',
    label: 'Dark',
  },
];

function AppColorSchemeSetting() {
  const appColorScheme = useKartonState(
    (s) => s.globalConfig.appColorScheme ?? 'system',
  );
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);

  const handleAppColorSchemeChange = async (value: AppColorScheme) => {
    await setGlobalConfig({ appColorScheme: value });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-medium text-base text-foreground">Appearance</h3>
        <p className="text-muted-foreground text-sm">
          Choose whether stagewise follows your system appearance or always uses
          light or dark mode.
        </p>
      </div>

      <Select
        value={appColorScheme}
        onValueChange={(value) =>
          handleAppColorSchemeChange(value as AppColorScheme)
        }
        items={APP_COLOR_SCHEME_ITEMS}
        triggerVariant="secondary"
        size="xs"
        triggerClassName="w-auto min-w-32 px-2 py-3"
        side="bottom"
        align="end"
      />
    </div>
  );
}

function ThemeSetting() {
  const { currentThemeId, handleThemeChange } = useThemeSelection();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-base text-foreground">Color scheme</h3>
        <p className="text-muted-foreground text-sm">
          Adapt the color style of your stagewise setup to your liking.
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
            <AppColorSchemeSetting />
            <ThemeSetting />
          </section>

          <hr className="border-derived-subtle border-t" />

          <section className="space-y-6">
            <NotificationsSetting />
          </section>

          <hr className="border-derived-subtle border-t" />

          <section className="space-y-6">
            <UiSizeSetting />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}
