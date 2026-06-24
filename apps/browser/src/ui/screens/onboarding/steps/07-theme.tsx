import { useEffect, useRef, useState } from 'react';
import { Select } from '@stagewise/stage-ui/components/select';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { PERSONALIZATION_THEMES } from '@shared/personalization-themes';
import type { PersonalizationThemeId } from '@shared/karton-contracts/ui/shared-types';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { applyPersonalizationThemeToRoot } from '@ui/components/personalization-theme-syncer';
import { ThemeBadge } from '@ui/components/theme-badge';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';
import { PlayIcon } from 'lucide-react';

const DEFAULT_SOUND_PACK = 'bubble-pops';
const NOTIFICATION_LOUDNESS_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'default', label: 'Loud' },
] as const;

type SoundLoudness = (typeof NOTIFICATION_LOUDNESS_OPTIONS)[number]['value'];

export function StepTheme({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center gap-4 overflow-hidden px-8 py-8">
        <div className="flex shrink-0 flex-col items-center gap-2 text-center">
          <h1 className="font-medium text-foreground text-xl">
            Personalize your setup
          </h1>
          <p className="max-w-md text-muted-foreground text-sm">
            Choose a color theme and notification sound. You can change these
            anytime in settings.
          </p>
        </div>

        <OverlayScrollbar
          className="w-full max-w-lg flex-1"
          contentClassName="flex flex-col gap-6 pb-4"
        >
          <ThemeSelection />
          <SoundSelection />
        </OverlayScrollbar>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={<NextButton onClick={onNext} label="Continue" />}
      />
    </>
  );
}

function ThemeSelection() {
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

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-foreground text-sm">Color scheme</h3>
        <p className="text-muted-foreground text-xs">
          Adapt the color style of your stagewise setup.
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

function SoundSelection() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const previewSoundPack = useKartonProcedure((p) => p.config.previewSoundPack);
  const track = useTrack();

  const soundLoudness: SoundLoudness =
    globalConfig.notificationSoundLoudness ??
    (globalConfig.notificationSoundsEnabled === false ? 'off' : 'subtle');
  const availablePacks =
    globalConfig.availableSoundPacks.length > 0
      ? globalConfig.availableSoundPacks
      : [DEFAULT_SOUND_PACK];
  const configuredPack = globalConfig.notificationSoundPack?.trim();
  const currentPack =
    configuredPack && availablePacks.includes(configuredPack)
      ? configuredPack
      : DEFAULT_SOUND_PACK;
  const packOptions = availablePacks.includes(currentPack)
    ? availablePacks
    : [currentPack, ...availablePacks];
  const loudnessIndex = Math.max(
    0,
    NOTIFICATION_LOUDNESS_OPTIONS.findIndex(
      (option) => option.value === soundLoudness,
    ),
  );

  const soundPackItems = packOptions.map((pack) => ({
    value: pack,
    label: globalConfig.packDisplayNames[pack] ?? pack,
  }));

  const previewSound = (pack = currentPack, loudness = soundLoudness) => {
    if (loudness === 'off') return;
    void previewSoundPack(pack, loudness).catch(() => {});
  };

  const handleLoudnessChange = async (value: number) => {
    const index = Math.max(
      0,
      Math.min(NOTIFICATION_LOUDNESS_OPTIONS.length - 1, Math.round(value)),
    );
    const notificationSoundLoudness =
      NOTIFICATION_LOUDNESS_OPTIONS[index]?.value ?? 'subtle';

    previewSound(currentPack, notificationSoundLoudness);

    await setGlobalConfig({
      notificationSoundsEnabled: notificationSoundLoudness !== 'off',
      notificationSoundLoudness,
    });
    track('changed-notification-sound-loudness', {
      loudness: notificationSoundLoudness,
    });
  };

  const handleSoundPackChange = async (value: unknown) => {
    if (typeof value !== 'string' || !packOptions.includes(value)) return;
    previewSound(value, soundLoudness);
    await setGlobalConfig({
      notificationSoundPack: value,
    });
    track('changed-notification-sound-theme', {
      theme: value === DEFAULT_SOUND_PACK ? value : 'custom',
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-foreground text-sm">
          Notification sounds
        </h3>
        <p className="text-muted-foreground text-xs">
          Play a sound when the agent finishes work or needs your attention.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-xs">Loudness</h4>
          <div className="w-32 space-y-0.5 pl-2">
            <Slider
              value={loudnessIndex}
              min={0}
              max={2}
              step={1}
              ariaLabel="Notification sound loudness"
              thickness="default"
              onValueChange={handleLoudnessChange}
            />
            <div className="relative h-3 text-[11px] text-muted-foreground">
              {NOTIFICATION_LOUDNESS_OPTIONS.map((option, index) => (
                <span
                  key={option.value}
                  className="absolute -translate-x-1/2"
                  style={{
                    left: `${
                      (index / (NOTIFICATION_LOUDNESS_OPTIONS.length - 1)) * 100
                    }%`,
                  }}
                >
                  {option.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-xs">Sound pack</h4>
          <div className="flex items-center gap-1">
            <Select
              value={currentPack}
              onValueChange={handleSoundPackChange}
              items={soundPackItems}
              size="sm"
              triggerClassName="w-40"
              side="bottom"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={soundLoudness === 'off'}
              onClick={() => previewSound()}
              aria-label="Preview sound"
            >
              <PlayIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
