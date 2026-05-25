import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select } from '@stagewise/stage-ui/components/select';
import { SearchableSelect } from '@stagewise/stage-ui/components/searchable-select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { Slider } from '@stagewise/stage-ui/components/slider';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { toast } from '@stagewise/stage-ui/components/toaster';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { IdeLogo } from '@ui/components/ide-logo';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { IDE_SELECTION_ITEMS } from '@ui/utils';
import { IconMediaPlayOutline18 } from 'nucleo-ui-outline-18';

export const Route = createFileRoute('/_internal-app/agent-settings/general')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'General Agent Settings',
      },
    ],
  }),
});

// =============================================================================
// IDE Selection Setting Component
// =============================================================================

const IDE_OPTIONS: { value: OpenFilesInIde; label: string }[] = [
  { value: 'cursor', label: 'Cursor' },
  { value: 'zed', label: 'Zed' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'kiro', label: 'Kiro' },
  { value: 'windsurf', label: 'Windsurf' },
  { value: 'trae', label: 'Trae' },
  { value: 'other', label: IDE_SELECTION_ITEMS.other },
];

function IdeSelectionSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const setGlobalConfig = useKartonProcedure((s) => s.setGlobalConfig);

  const currentIde = globalConfig.openFilesInIde;

  const handleIdeChange = async (value: string) => {
    await setGlobalConfig({
      ...globalConfig,
      openFilesInIde: value as OpenFilesInIde,
      hasSetIde: true,
    });
  };

  const selectItems = IDE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
    triggerLabel: (
      <div className="flex items-center gap-2">
        <IdeLogo ide={option.value} className="size-4" />
        {option.label}
      </div>
    ),
    icon: <IdeLogo ide={option.value} className="size-4" />,
    searchText: option.label,
  }));

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-medium text-base text-foreground">Open files in</h3>
        <p className="text-muted-foreground text-sm">
          Choose which file manager to use when opening files in the agent chat.
        </p>
      </div>

      <SearchableSelect
        value={currentIde}
        onValueChange={(value) => handleIdeChange(value as OpenFilesInIde)}
        items={selectItems}
        triggerVariant="secondary"
        size="xs"
        triggerClassName="w-auto min-w-0 px-2 py-3"
        side="bottom"
      />
    </div>
  );
}

// =============================================================================
// Notification Sounds Setting
// =============================================================================

const DEFAULT_SOUND_PACK = 'bubble-pops';
const LOUDNESS_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'default', label: 'Loud' },
] as const;
type SoundLoudness = (typeof LOUDNESS_OPTIONS)[number]['value'];

function NotificationSoundsSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const setGlobalConfig = useKartonProcedure((s) => s.setGlobalConfig);
  const importSoundPack = useKartonProcedure((s) => s.importSoundPack);
  const previewSoundPack = useKartonProcedure((s) => s.previewSoundPack);

  const soundLoudness: SoundLoudness =
    globalConfig.notificationSoundLoudness ??
    (globalConfig.notificationSoundsEnabled === false ? 'off' : 'subtle');
  const configuredPack = globalConfig.notificationSoundPack?.trim();
  const availablePacks =
    globalConfig.availableSoundPacks &&
    globalConfig.availableSoundPacks.length > 0
      ? globalConfig.availableSoundPacks
      : [DEFAULT_SOUND_PACK];
  const currentPack =
    configuredPack && availablePacks.includes(configuredPack)
      ? configuredPack
      : DEFAULT_SOUND_PACK;
  const packOptions = availablePacks.includes(currentPack)
    ? availablePacks
    : [currentPack, ...availablePacks];
  const displayNames =
    globalConfig.packDisplayNames ?? ({} as Record<string, string>);

  const loudnessIndex = Math.max(
    0,
    LOUDNESS_OPTIONS.findIndex((option) => option.value === soundLoudness),
  );

  const handleLoudnessChange = async (value: number) => {
    const index = Math.max(
      0,
      Math.min(LOUDNESS_OPTIONS.length - 1, Math.round(value)),
    );
    const loudness = LOUDNESS_OPTIONS[index]?.value ?? 'subtle';
    if (loudness !== 'off') {
      void previewSoundPack(currentPack, loudness).catch(() => {
        // Preview is best-effort; config changes should still succeed.
      });
    }
    await setGlobalConfig({
      ...globalConfig,
      notificationSoundLoudness: loudness,
      // Keep legacy boolean in sync for older config consumers.
      notificationSoundsEnabled: loudness !== 'off',
    });
  };

  const handlePreviewSound = () => {
    if (soundLoudness === 'off') return;
    void previewSoundPack(currentPack, soundLoudness).catch(() => {
      // Preview is best-effort.
    });
  };

  const handlePackChange = async (value: unknown) => {
    if (typeof value !== 'string' || !packOptions.includes(value)) return;
    if (soundLoudness !== 'off') {
      void previewSoundPack(value, soundLoudness).catch(() => {
        // Preview is best-effort; config changes should still succeed.
      });
    }
    await setGlobalConfig({
      ...globalConfig,
      notificationSoundPack: value,
    });
  };

  const showImportErrorToast = (message: string) => {
    toast({
      id: `import-sound-pack-error-${Date.now()}`,
      title: 'Custom sound import failed',
      message,
      type: 'error',
      actions: [],
    });
  };

  const handleImport = async () => {
    try {
      const result = await importSoundPack();
      if (result && 'error' in result && result.error) {
        showImportErrorToast(result.error);
      }
    } catch (err) {
      showImportErrorToast(
        err instanceof Error ? err.message : 'Custom sound import failed.',
      );
    }
  };

  const packLabel = (id: string): string =>
    displayNames[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

  const packItems = packOptions.map((pack) => ({
    value: pack,
    label: packLabel(pack),
  }));

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
              onValueChange={handleLoudnessChange}
            />
            <div className="relative h-3 text-[11px] text-muted-foreground">
              {LOUDNESS_OPTIONS.map((option, index) => (
                <span
                  key={option.value}
                  className="absolute -translate-x-1/2"
                  style={{
                    left: `${(index / (LOUDNESS_OPTIONS.length - 1)) * 100}%`,
                  }}
                >
                  {option.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-foreground text-sm">Theme</h4>
          <div className="flex items-center gap-1.5">
            <Select
              value={currentPack}
              onValueChange={handlePackChange}
              items={packItems}
              triggerVariant="secondary"
              size="xs"
              triggerClassName="w-40 min-w-0 px-2 py-3"
              side="bottom"
            />
            <Tooltip>
              <TooltipTrigger>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  disabled={soundLoudness === 'off'}
                  onClick={handlePreviewSound}
                  aria-label="Preview sound"
                >
                  <IconMediaPlayOutline18 className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Preview sound</TooltipContent>
            </Tooltip>
          </div>
          <button
            type="button"
            className="block text-muted-foreground text-xs underline transition-colors hover:text-foreground"
            onClick={handleImport}
          >
            Use custom sound…
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Dock Bounce Setting (macOS only)
// =============================================================================

function DockBounceSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const setGlobalConfig = useKartonProcedure((s) => s.setGlobalConfig);
  const appInfo = useKartonState((s) => s.appInfo);

  const isMacOS = appInfo.platform === 'darwin';
  if (!isMacOS) return null;

  const dockBounceEnabled = globalConfig.dockBounceEnabled ?? true;

  const handleToggle = async (checked: boolean) => {
    await setGlobalConfig({
      ...globalConfig,
      dockBounceEnabled: checked,
    });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-medium text-base text-foreground">
          Dock icon bounce
        </h3>
        <p className="text-muted-foreground text-sm">
          Bounce the dock icon when the agent finishes, asks a question, or
          encounters an error while the window is not focused.
        </p>
      </div>
      <Switch
        checked={dockBounceEnabled}
        onCheckedChange={handleToggle}
        size="xs"
      />
    </div>
  );
}

// =============================================================================
// Main Page Component
// =============================================================================

function Page() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border-subtle border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">General</h1>
          <p className="text-muted-foreground text-sm">
            General agent behavior and environment settings.
          </p>
        </div>
      </div>

      {/* Content */}
      <OverlayScrollbar className="flex-1" contentClassName="px-6 pt-6 pb-24">
        <div className="mx-auto max-w-3xl space-y-8">
          <section className="space-y-6">
            <IdeSelectionSetting />
          </section>

          <hr className="border-derived-strong" />

          <section className="space-y-6">
            <h2 className="font-medium text-foreground text-lg">
              Notifications
            </h2>
            <NotificationSoundsSetting />
            <DockBounceSetting />
          </section>
        </div>
      </OverlayScrollbar>
    </div>
  );
}
