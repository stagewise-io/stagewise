import { createFileRoute } from '@tanstack/react-router';
import { SearchableSelect } from '@stagewise/stage-ui/components/searchable-select';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { Switch } from '@stagewise/stage-ui/components/switch';
import { toast } from '@stagewise/stage-ui/components/toaster';
import { useKartonState, useKartonProcedure } from '@pages/hooks/use-karton';
import { IdeLogo } from '@ui/components/ide-logo';
import type { OpenFilesInIde } from '@shared/karton-contracts/ui/shared-types';
import { IDE_SELECTION_ITEMS } from '@ui/utils';

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

function NotificationSoundsSetting() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const setGlobalConfig = useKartonProcedure((s) => s.setGlobalConfig);
  const importSoundPack = useKartonProcedure((s) => s.importSoundPack);

  const soundLoudness =
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

  const handleLoudnessChange = async (value: unknown) => {
    const loudness = value as 'off' | 'subtle' | 'default';
    await setGlobalConfig({
      ...globalConfig,
      notificationSoundLoudness: loudness,
      // Keep legacy boolean in sync for older config consumers.
      notificationSoundsEnabled: loudness !== 'off',
    });
  };

  const handlePackChange = async (value: unknown) => {
    await setGlobalConfig({
      ...globalConfig,
      notificationSoundPack: String(value),
    });
  };

  const showImportErrorToast = (message: string) => {
    toast({
      id: `import-sound-pack-error-${Date.now()}`,
      title: 'Import failed',
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
        err instanceof Error ? err.message : 'Sound pack import failed.',
      );
    }
  };

  const packLabel = (id: string): string =>
    displayNames[id] ?? id.charAt(0).toUpperCase() + id.slice(1);

  const loudnessItems = [
    { value: 'off', label: 'Off' },
    { value: 'subtle', label: 'Subtle' },
    { value: 'default', label: 'Default' },
  ];

  const packItems = packOptions.map((pack) => ({
    value: pack,
    label: packLabel(pack),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-medium text-base text-foreground">
            Notification sounds
          </h3>
          <p className="text-muted-foreground text-sm">
            Play a sound when the agent finishes work, asks a question, or
            encounters an error.
          </p>
        </div>
        <SearchableSelect
          value={soundLoudness}
          onValueChange={handleLoudnessChange}
          items={loudnessItems}
          triggerVariant="secondary"
          size="xs"
          triggerClassName="w-auto min-w-0 px-2 py-3"
          side="bottom"
        />
      </div>

      <div className="flex items-center justify-between gap-4 pl-0">
        <div>
          <h3 className="font-medium text-foreground text-sm">Sound pack</h3>
          <p className="text-muted-foreground text-xs">
            Choose which set of notification sounds to use.
          </p>
        </div>

        <SearchableSelect
          value={currentPack}
          onValueChange={handlePackChange}
          items={packItems}
          triggerVariant="secondary"
          size="xs"
          triggerClassName="w-auto min-w-0 px-2 py-3"
          side="bottom"
        />
      </div>

      <button
        type="button"
        className="text-muted-foreground text-xs underline transition-colors hover:text-foreground"
        onClick={handleImport}
      >
        Import sound pack…
      </button>
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
        size="sm"
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
