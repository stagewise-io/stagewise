import { useCallback, useState } from 'react';
import { Select } from '@stagewise/stage-ui/components/select';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { PERSONALIZATION_THEMES } from '@shared/personalization-themes';
import { useThemeSelection } from '@ui/hooks/use-theme-selection';
import {
  useSoundSettings,
  NOTIFICATION_LOUDNESS_OPTIONS,
} from '@ui/hooks/use-sound-settings';
import { ThemeBadge } from '@ui/components/theme-badge';
import { BackButton, NextButton, OnboardingBottomNav } from '../index';
import { PlayIcon } from 'lucide-react';

export function StepTheme({
  onNext,
  onBack,
  onPersonalizationChanged,
}: {
  onNext: () => void;
  onBack: () => void;
  onPersonalizationChanged: () => void;
}) {
  const [pendingMutationCount, setPendingMutationCount] = useState(0);
  const isPersonalizationPending = pendingMutationCount > 0;

  const persistPersonalizationChange = useCallback(
    async (mutation: () => Promise<boolean>) => {
      setPendingMutationCount((count) => count + 1);
      try {
        if (await mutation()) onPersonalizationChanged();
      } finally {
        setPendingMutationCount((count) => count - 1);
      }
    },
    [onPersonalizationChanged],
  );

  const handleFinish = useCallback(() => {
    if (!isPersonalizationPending) onNext();
  }, [isPersonalizationPending, onNext]);

  return (
    <>
      <div className="app-no-drag flex flex-1 flex-col items-center overflow-hidden px-8 py-8">
        <OverlayScrollbar
          className="w-full max-w-3xl flex-1"
          contentClassName="flex flex-col justify-center gap-10 pb-4 h-full"
        >
          <div className="flex shrink-0 flex-col items-center gap-2 text-center">
            <h1 className="font-medium text-foreground text-xl">
              Personalize your setup
            </h1>
            <p className="max-w-md text-muted-foreground text-sm">
              Choose a color theme and notification sound. You can change these
              anytime in settings.
            </p>
          </div>

          <ThemeSelection onChange={persistPersonalizationChange} />
          <SoundSelection onChange={persistPersonalizationChange} />
        </OverlayScrollbar>
      </div>
      <OnboardingBottomNav
        left={<BackButton onClick={onBack} />}
        right={
          <NextButton
            onClick={handleFinish}
            label="Finish"
            disabled={isPersonalizationPending}
          />
        }
      />
    </>
  );
}

type PersonalizationChangeHandler = (
  mutation: () => Promise<boolean>,
) => Promise<void>;

function ThemeSelection({
  onChange,
}: {
  onChange: PersonalizationChangeHandler;
}) {
  const { currentThemeId, handleThemeChange } = useThemeSelection();

  const themeIds = PERSONALIZATION_THEMES.map((t) => t.id);

  const handleThemeKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      const lastIndex = themeIds.length - 1;
      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = lastIndex;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        const nextId = themeIds[nextIndex]!;
        void onChange(() => handleThemeChange(nextId));
        // Move focus to the newly-selected radio
        const container = e.currentTarget.parentElement;
        if (container) {
          const buttons =
            container.querySelectorAll<HTMLButtonElement>('[role="radio"]');
          buttons[nextIndex]?.focus();
        }
      }
    },
    [themeIds, handleThemeChange, onChange],
  );

  return (
    <div
      className="flex flex-wrap justify-center gap-3"
      role="radiogroup"
      aria-label="Color theme"
    >
      {PERSONALIZATION_THEMES.map((theme, index) => {
        const active = theme.id === currentThemeId;
        return (
          <button
            key={theme.id}
            type="button"
            className="group rounded-lg"
            onClick={() => {
              void onChange(() => handleThemeChange(theme.id));
            }}
            onKeyDown={(e) => handleThemeKeyDown(e, index)}
            aria-checked={active}
            aria-label={`Use ${theme.name} theme`}
            role="radio"
            tabIndex={active ? 0 : -1}
            title={theme.name}
          >
            <ThemeBadge themeId={theme.id} name={theme.name} active={active} />
          </button>
        );
      })}
    </div>
  );
}

function SoundSelection({
  onChange,
}: {
  onChange: PersonalizationChangeHandler;
}) {
  const {
    soundLoudness,
    currentPack,
    soundPackItems,
    loudnessIndex,
    previewSound,
    handleLoudnessChange,
    handleSoundPackChange,
  } = useSoundSettings();

  return (
    <div className="flex flex-wrap justify-center gap-24">
      <div className="space-y-2">
        <h4 className="font-medium text-foreground text-xs">Sound pack</h4>
        <div className="flex items-center gap-1">
          <Select
            value={currentPack}
            onValueChange={(value) => {
              void onChange(() => handleSoundPackChange(value));
            }}
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
            onValueChange={(value) => {
              void onChange(() => handleLoudnessChange(value));
            }}
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
    </div>
  );
}
