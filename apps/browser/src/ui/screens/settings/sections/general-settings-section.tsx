import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { Select } from '@stagewise/stage-ui/components/select';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { toast } from '@stagewise/stage-ui/components/toaster';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';
import { PlayIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react';

// =============================================================================
// Power Save Blocker Setting Component
// =============================================================================

function PowerSaveBlockerSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);

  const isEnabled = globalConfig.blockAppSuspensionWhenAgentsActive ?? true;

  const handleChange = async (checked: boolean) => {
    await setGlobalConfig({
      blockAppSuspensionWhenAgentsActive: checked,
    });
  };

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <label htmlFor="agent-power-save-blocker">
          <h3 className="font-medium text-base text-foreground">
            Keep app awake while agents work
          </h3>
          <p className="text-muted-foreground text-sm">
            Prevent app suspension while agents run tool loops or other active
            work. Waiting for questions or tool approval still counts as idle.
          </p>
        </label>

        {isMacOs && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-background/45 p-2 text-warning-foreground text-xs leading-snug ring-1 ring-warning-solid/20">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
            <p>
              To prevent sleep in battery mode on macOS devices, including when
              the lid is closed, you must enable “Keep awake” mode in the
              bottom-right corner of the sidebar.
            </p>
          </div>
        )}
      </div>

      <Switch
        id="agent-power-save-blocker"
        checked={isEnabled}
        onCheckedChange={handleChange}
        size="xs"
        className="mt-1 shrink-0"
      />
    </div>
  );
}

// =============================================================================
// Notifications Setting Component
// =============================================================================

const DEFAULT_SOUND_PACK = 'bubble-pops';
const NOTIFICATION_LOUDNESS_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'default', label: 'Loud' },
] as const;

type SoundLoudness = (typeof NOTIFICATION_LOUDNESS_OPTIONS)[number]['value'];

export function NotificationsSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const notificationSoundPacks = useKartonState(
    (s) => s.notificationSoundPacks,
  );
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const previewSoundPack = useKartonProcedure((p) => p.config.previewSoundPack);
  const importSoundPack = useKartonProcedure((p) => p.config.importSoundPack);
  const track = useTrack();

  const soundLoudness: SoundLoudness =
    globalConfig.notificationSoundLoudness ?? 'subtle';
  const availablePacks =
    notificationSoundPacks.available.length > 0
      ? notificationSoundPacks.available
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
    label: notificationSoundPacks.displayNames[pack] ?? pack,
  }));

  const previewSound = (pack = currentPack, loudness = soundLoudness) => {
    if (loudness === 'off') return;
    void previewSoundPack(pack, loudness).catch(() => {
      // Preview is best-effort; config changes should still succeed.
    });
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

  const handleImportSoundPack = async () => {
    try {
      const result = await importSoundPack();
      if ('error' in result) {
        if (result.error) {
          toast({
            id: `import-sound-pack-error-${Date.now()}`,
            title: 'Custom sound import failed',
            message: result.error,
            type: 'error',
            actions: [],
          });
        }
        return;
      }

      toast({
        id: `import-sound-pack-success-${Date.now()}`,
        title: 'Custom sound imported',
        message: `${result.name} is now selected for notifications.`,
        type: 'info',
        duration: 4000,
        actions: [],
      });
    } catch (err) {
      toast({
        id: `import-sound-pack-error-${Date.now()}`,
        title: 'Custom sound import failed',
        message:
          err instanceof Error ? err.message : 'Custom sound import failed.',
        type: 'error',
        actions: [],
      });
    }
  };

  const handleDockBounceChange = async (checked: boolean) => {
    await setGlobalConfig({
      dockBounceEnabled: checked,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-base text-foreground">
          Notification sounds
        </h3>
        <p className="text-muted-foreground text-sm">
          Play a sound when the agent finishes work, asks a question, or
          encounters an error.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">Loudness</h4>
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
          <h4 className="font-medium text-foreground text-sm">Sound pack</h4>
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
          <button
            type="button"
            className="block text-muted-foreground text-xs underline transition-colors hover:text-foreground"
            onClick={handleImportSoundPack}
          >
            <span className="inline-flex items-center gap-1">
              <UploadIcon className="size-3" />
              Use custom sound…
            </span>
          </button>
        </div>
      </div>

      {isMacOs && (
        <div
          className="flex cursor-pointer items-center justify-between gap-4 pt-2"
          onClick={() =>
            handleDockBounceChange(!globalConfig.dockBounceEnabled)
          }
        >
          <div>
            <h3 className="font-medium text-base text-foreground">
              Dock icon bounce
            </h3>
            <p className="text-muted-foreground text-sm">
              Bounce the dock icon when the agent finishes, asks a question, or
              encounters an error while the window is not focused.
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={globalConfig.dockBounceEnabled}
              onCheckedChange={handleDockBounceChange}
              size="xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Section Component
// =============================================================================

export function GeneralSettingsSection() {
  return (
    <div className="h-full w-full">
      <OverlayScrollbar className="h-full" contentClassName="px-6 pt-24 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* Header */}
          <div>
            <h1 className="font-semibold text-foreground text-xl">General</h1>
          </div>
          <section className="space-y-6">
            <PowerSaveBlockerSetting />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}
