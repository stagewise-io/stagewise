import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  RadioGroup,
  Radio,
  RadioLabel,
} from '@stagewise/stage-ui/components/radio';
import { Button } from '@stagewise/stage-ui/components/button';
import { Input } from '@stagewise/stage-ui/components/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from '@stagewise/stage-ui/components/dialog';
import { produceWithPatches, enablePatches } from 'immer';
import {
  PlusIcon,
  Trash2Icon,
  Loader2Icon,
  ChevronRightIcon,
} from 'lucide-react';

enablePatches();

import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { Select } from '@stagewise/stage-ui/components/select';
import type {
  TelemetryLevel,
  PageSetting,
  ConfigurablePermissionType,
} from '@shared/karton-contracts/ui/shared-types';
import {
  PermissionSetting,
  configurablePermissionTypes,
} from '@shared/karton-contracts/ui/shared-types';

export const Route = createFileRoute('/_internal-app/browsing-settings/')({
  component: Page,
  head: () => ({
    meta: [
      {
        title: 'Browsing Settings',
      },
    ],
  }),
});

// =============================================================================
// Search Engine Setting Component
// =============================================================================

function SearchEngineSetting() {
  const preferences = useKartonState((s) => s.preferences);
  const searchEngines = useKartonState((s) => s.searchEngines);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);
  const addSearchEngine = useKartonProcedure((s) => s.addSearchEngine);
  const removeSearchEngine = useKartonProcedure((s) => s.removeSearchEngine);

  const defaultEngineId = preferences.search.defaultEngineId;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEngine, setNewEngine] = useState({
    name: '',
    url: '',
    keyword: '',
  });
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDefaultEngineChange = async (value: string) => {
    const engineId = Number.parseInt(value, 10);
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.search.defaultEngineId = engineId;
    });
    await updatePreferences(patches);
  };

  const handleAddEngine = async () => {
    setIsAdding(true);
    setAddError(null);

    const result = await addSearchEngine({
      name: newEngine.name,
      url: newEngine.url,
      keyword: newEngine.keyword,
    });

    setIsAdding(false);

    if (result.success) {
      setIsAddDialogOpen(false);
      setNewEngine({ name: '', url: '', keyword: '' });
    } else {
      setAddError(result.error);
    }
  };

  const handleRemoveEngine = async (id: number) => {
    setDeleteError(null);
    const result = await removeSearchEngine(id);
    if (!result.success) {
      setDeleteError(result.error ?? 'Failed to remove search engine');
    }
  };

  const isUrlValid =
    newEngine.url.includes('%s') &&
    (() => {
      try {
        new URL(newEngine.url.replace('%s', 'test'));
        return true;
      } catch {
        return false;
      }
    })();

  const canAdd =
    newEngine.name.trim() && newEngine.keyword.trim() && isUrlValid;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-base text-foreground">
          Default Search Engine
        </h3>
      </div>

      <RadioGroup
        value={String(defaultEngineId)}
        onValueChange={handleDefaultEngineChange}
      >
        {searchEngines.map((engine) => (
          <div
            key={engine.id}
            className="flex items-center justify-between gap-4"
          >
            <RadioLabel className="flex-1">
              <Radio value={String(engine.id)} />
              <div className="flex items-center gap-2">
                {engine.faviconUrl && (
                  <img
                    src={engine.faviconUrl}
                    alt=""
                    className="size-4"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {engine.shortName}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {engine.keyword}
                  </span>
                </div>
              </div>
            </RadioLabel>

            {!engine.isBuiltIn && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemoveEngine(engine.id)}
                disabled={engine.id === defaultEngineId}
                title={
                  engine.id === defaultEngineId
                    ? 'Cannot delete default engine'
                    : 'Remove search engine'
                }
              >
                <Trash2Icon className="size-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        ))}
      </RadioGroup>

      {deleteError && <p className="text-red-500 text-sm">{deleteError}</p>}

      <div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger>
            <Button variant="secondary" size="sm">
              <PlusIcon className="mr-2 size-4" />
              Add Search Engine
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogClose />
            <DialogHeader>
              <DialogTitle>Add Search Engine</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="engine-name"
                  className="font-medium text-foreground text-sm"
                >
                  Name
                </label>
                <Input
                  id="engine-name"
                  placeholder="My Search Engine"
                  value={newEngine.name}
                  onValueChange={(value) =>
                    setNewEngine((prev) => ({ ...prev, name: value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="engine-keyword"
                  className="font-medium text-foreground text-sm"
                >
                  Keyword
                </label>
                <Input
                  id="engine-keyword"
                  placeholder="mysearch.com"
                  value={newEngine.keyword}
                  onValueChange={(value) =>
                    setNewEngine((prev) => ({ ...prev, keyword: value }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  The keyword used to identify this search engine
                </p>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="engine-url"
                  className="font-medium text-foreground text-sm"
                >
                  Search URL
                </label>
                <Input
                  id="engine-url"
                  placeholder="https://example.com/search?q=%s"
                  value={newEngine.url}
                  onValueChange={(value) =>
                    setNewEngine((prev) => ({ ...prev, url: value }))
                  }
                />
                <p className="text-muted-foreground text-xs">
                  URL with %s where the search query should be inserted
                </p>
                {newEngine.url && !isUrlValid && (
                  <p className="text-red-500 text-xs">
                    URL must be valid and contain %s placeholder
                  </p>
                )}
              </div>

              {addError && <p className="text-red-500 text-sm">{addError}</p>}
            </div>

            <DialogFooter>
              <Button
                variant="primary"
                onClick={handleAddEngine}
                disabled={!canAdd || isAdding}
              >
                {isAdding ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  'Add Search Engine'
                )}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

// =============================================================================
// Page Setting Component (New Tab / Startup)
// =============================================================================

type PageSettingType = 'newTabPage' | 'startupPage';

interface PageSettingProps {
  type: PageSettingType;
  title: string;
  description: string;
}

function PageSettingComponent({ type, title, description }: PageSettingProps) {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const pageSetting = preferences.general[type];

  const [localUrl, setLocalUrl] = useState(pageSetting.customUrl ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state with preferences when they change externally
  useEffect(() => {
    setLocalUrl(pageSetting.customUrl ?? '');
  }, [pageSetting.customUrl]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleTypeChange = async (value: string) => {
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.general[type].type = value as PageSetting['type'];
    });
    await updatePreferences(patches);
  };

  const handleUrlChange = (value: string) => {
    // Update local state immediately for responsive UI
    setLocalUrl(value);

    // Debounce the preference update
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(async () => {
      const [, patches] = produceWithPatches(preferences, (draft) => {
        draft.general[type].customUrl = value;
      });
      await updatePreferences(patches);
    }, 200);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-base text-foreground">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <RadioGroup value={pageSetting.type} onValueChange={handleTypeChange}>
        <RadioLabel>
          <Radio value="home" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Stagewise Home</span>
            <span className="text-muted-foreground text-xs">
              Open the stagewise home page
            </span>
          </div>
        </RadioLabel>

        <RadioLabel>
          <Radio value="custom" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Custom URL</span>
            <span className="text-muted-foreground text-xs">
              Open a specific URL
            </span>
          </div>
        </RadioLabel>
      </RadioGroup>

      {pageSetting.type === 'custom' && (
        <div className="ml-6 space-y-2">
          <Input
            placeholder="https://example.com"
            value={localUrl}
            onValueChange={handleUrlChange}
          />
        </div>
      )}
    </div>
  );
}

function NewTabPageSetting() {
  return (
    <PageSettingComponent
      type="newTabPage"
      title="New Tab Page"
      description="Choose what page opens when you create a new tab."
    />
  );
}

function StartupPageSetting() {
  return (
    <PageSettingComponent
      type="startupPage"
      title="On Browser Start"
      description="Choose what page opens when stagewise starts."
    />
  );
}

// =============================================================================
// Permission Defaults Setting Component
// =============================================================================

/** Human-readable labels for permission types */
const permissionTypeLabels: Record<ConfigurablePermissionType, string> = {
  media: 'Camera & Microphone',
  geolocation: 'Location',
  notifications: 'Notifications',
  fullscreen: 'Fullscreen',
  bluetooth: 'Bluetooth',
  hid: 'HID Devices',
  serial: 'Serial Ports',
  usb: 'USB Devices',
  'clipboard-read': 'Clipboard Read',
  'display-capture': 'Screen Capture',
  midi: 'MIDI Devices',
  'idle-detection': 'Idle Detection',
  'speaker-selection': 'Speaker Selection',
  'storage-access': 'Storage Access',
};

/** Human-readable labels for permission settings */
const permissionSettingLabels: Record<PermissionSetting, string> = {
  [PermissionSetting.Ask]: 'Ask',
  [PermissionSetting.Allow]: 'Allow',
  [PermissionSetting.Block]: 'Block',
};

function PermissionDefaultsSetting() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const handlePermissionChange = useCallback(
    async (permissionType: ConfigurablePermissionType, value: string) => {
      const setting = Number.parseInt(value, 10) as PermissionSetting;
      const [, patches] = produceWithPatches(preferences, (draft) => {
        // Ensure structure exists
        if (!draft.permissions) {
          draft.permissions = {
            defaults: {},
            exceptions: {},
          } as typeof draft.permissions;
        }
        if (!draft.permissions.defaults) {
          draft.permissions.defaults = {} as typeof draft.permissions.defaults;
        }
        draft.permissions.defaults[permissionType] = setting;
      });
      await updatePreferences(patches);
    },
    [preferences, updatePreferences],
  );

  // Permissions that require device selection - "Allow" doesn't make sense
  const deviceSelectionPermissions: ConfigurablePermissionType[] = [
    'bluetooth',
    'hid',
    'serial',
    'usb',
  ];

  const getSettingOptions = (permissionType: ConfigurablePermissionType) => {
    const isDevicePermission =
      deviceSelectionPermissions.includes(permissionType);

    const options = [
      {
        value: String(PermissionSetting.Ask),
        label: permissionSettingLabels[PermissionSetting.Ask],
        description: 'Ask every time',
      },
    ];

    // Only add "Allow" for non-device permissions
    if (!isDevicePermission) {
      options.push({
        value: String(PermissionSetting.Allow),
        label: permissionSettingLabels[PermissionSetting.Allow],
        description: 'Always allow',
      });
    }

    options.push({
      value: String(PermissionSetting.Block),
      label: permissionSettingLabels[PermissionSetting.Block],
      description: 'Always block',
    });

    return options;
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-base text-foreground">
          Permission Defaults
        </h3>
        <p className="text-muted-foreground text-sm">
          Set the default behavior when websites request these permissions.
        </p>
      </div>

      <div className="space-y-3">
        {configurablePermissionTypes.map((permissionType) => (
          <div
            key={permissionType}
            className="flex items-center justify-between gap-4"
          >
            <span className="font-medium text-foreground text-sm">
              {permissionTypeLabels[permissionType]}
            </span>
            <Select
              value={String(
                preferences.permissions?.defaults?.[permissionType] ??
                  PermissionSetting.Ask,
              )}
              onValueChange={(value) =>
                handlePermissionChange(permissionType, value)
              }
              triggerVariant="secondary"
              size="sm"
              triggerClassName="w-28"
              items={getSettingOptions(permissionType)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Website Permission Overrides Component
// =============================================================================

function WebsitePermissionOverrides() {
  const preferences = useKartonState((s) => s.preferences);
  const navigate = useNavigate();

  // Collect all unique hosts that have any permission overrides
  const hostsWithOverrides = (() => {
    const hostMap = new Map<string, number>();
    const exceptions = preferences.permissions?.exceptions;

    if (exceptions) {
      for (const permType of configurablePermissionTypes) {
        const typeExceptions = exceptions[permType];
        if (typeExceptions) {
          for (const host of Object.keys(typeExceptions)) {
            hostMap.set(host, (hostMap.get(host) || 0) + 1);
          }
        }
      }
    }

    // Convert to array and sort by host name
    return Array.from(hostMap.entries())
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => a.host.localeCompare(b.host));
  })();

  const handleHostClick = (host: string) => {
    navigate({
      to: '/browsing-settings/website-permissions',
      search: { host },
    });
  };

  if (hostsWithOverrides.length === 0) {
    return (
      <div className="space-y-3">
        <div>
          <h3 className="font-medium text-base text-foreground">
            Website-Specific Settings
          </h3>
          <p className="text-muted-foreground text-sm">
            Sites with custom permission settings will appear here.
          </p>
        </div>

        <div className="rounded-lg border border-border/30 bg-surface-1/50 p-4">
          <p className="text-center text-muted-foreground text-sm">
            No websites have custom permission settings yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-base text-foreground">
          Website-Specific Settings
        </h3>
        <p className="text-muted-foreground text-sm">
          Sites with custom permission settings. Click to view or edit.
        </p>
      </div>

      <div className="space-y-1">
        {hostsWithOverrides.map(({ host, count }) => (
          <button
            key={host}
            type="button"
            onClick={() => handleHostClick(host)}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/30 p-3 text-left transition-colors hover:bg-surface-1"
          >
            <div className="flex flex-col">
              <span className="font-medium text-foreground text-sm">
                {host}
              </span>
              <span className="text-muted-foreground text-xs">
                {count} custom permission{count !== 1 ? 's' : ''}
              </span>
            </div>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Telemetry Setting Component
// =============================================================================

function TelemetrySetting() {
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  const telemetryMode = preferences.privacy.telemetryLevel;

  const handleTelemetryChange = async (value: string) => {
    const [, patches] = produceWithPatches(preferences, (draft) => {
      draft.privacy.telemetryLevel = value as TelemetryLevel;
    });
    await updatePreferences(patches);
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-medium text-base text-foreground">Telemetry</h3>
        <p className="text-muted-foreground text-sm">
          Control what usage data is collected to help improve stagewise.
        </p>
      </div>

      <RadioGroup value={telemetryMode} onValueChange={handleTelemetryChange}>
        <RadioLabel>
          <Radio value="full" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Full</span>
            <span className="text-muted-foreground text-xs">
              Send all telemetry data including usage patterns and diagnostics
            </span>
          </div>
        </RadioLabel>

        <RadioLabel>
          <Radio value="anonymous" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Anonymous</span>
            <span className="text-muted-foreground text-xs">
              Send anonymized telemetry data without personal identifiers
            </span>
          </div>
        </RadioLabel>

        <RadioLabel>
          <Radio value="off" />
          <div className="flex flex-col">
            <span className="font-medium text-foreground">Off</span>
            <span className="text-muted-foreground text-xs">
              Don't send any telemetry data
            </span>
          </div>
        </RadioLabel>
      </RadioGroup>
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
      <div className="flex items-center border-border/30 border-b px-6 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="font-semibold text-foreground text-xl">
            Browsing Settings
          </h1>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-subtle flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {/* General Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">General</h2>
            </div>

            <SearchEngineSetting />

            <div className="pt-2">
              <NewTabPageSetting />
            </div>

            <div className="pt-2">
              <StartupPageSetting />
            </div>
          </section>

          <hr className="border-border/20" />

          {/* Privacy Section */}
          <section className="space-y-6">
            <div>
              <h2 className="font-medium text-foreground text-lg">Privacy</h2>
              <p className="text-muted-foreground text-sm">
                Manage your privacy and data sharing preferences.
              </p>
            </div>

            <TelemetrySetting />

            <div className="pt-2">
              <PermissionDefaultsSetting />
            </div>

            <div className="pt-2">
              <WebsitePermissionOverrides />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
