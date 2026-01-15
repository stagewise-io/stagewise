import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { Select } from '@stagewise/stage-ui/components/select';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { produceWithPatches, enablePatches } from 'immer';
import { ChevronLeftIcon } from 'lucide-react';
import type { ConfigurablePermissionType } from '@shared/karton-contracts/ui/shared-types';
import {
  PermissionSetting,
  configurablePermissionTypes,
} from '@shared/karton-contracts/ui/shared-types';

enablePatches();

export const Route = createFileRoute(
  '/_internal-app/browsing-settings/website-permissions',
)({
  component: Page,
  validateSearch: (search: Record<string, unknown>) => ({
    host: (search.host as string) || '',
  }),
  head: ({ search }) => {
    const host = search?.host;
    return {
      meta: [
        {
          title: host ? `Website permissions: ${host}` : 'Website Permissions',
        },
      ],
    };
  },
});

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
const permissionSettingLabels: Record<PermissionSetting | -1, string> = {
  [-1]: 'Default',
  [PermissionSetting.Ask]: 'Ask',
  [PermissionSetting.Allow]: 'Allow',
  [PermissionSetting.Block]: 'Block',
};

function Page() {
  const { host } = Route.useSearch();
  const navigate = useNavigate();
  const preferences = useKartonState((s) => s.preferences);
  const updatePreferences = useKartonProcedure((s) => s.updatePreferences);

  // Get the current setting for a permission type for this host
  const getHostSetting = useCallback(
    (permissionType: ConfigurablePermissionType): PermissionSetting | -1 => {
      const exception =
        preferences.permissions?.exceptions?.[permissionType]?.[host];
      if (exception !== undefined) {
        return exception.setting;
      }
      return -1; // Default (no override)
    },
    [preferences, host],
  );

  // Get the effective default setting for a permission type
  const getDefaultSetting = useCallback(
    (permissionType: ConfigurablePermissionType): PermissionSetting => {
      return (
        preferences.permissions?.defaults?.[permissionType] ??
        PermissionSetting.Ask
      );
    },
    [preferences],
  );

  const handlePermissionChange = useCallback(
    async (permissionType: ConfigurablePermissionType, value: string) => {
      const settingValue = Number.parseInt(value, 10);

      const [, patches] = produceWithPatches(preferences, (draft) => {
        // Ensure structure exists
        if (!draft.permissions) {
          draft.permissions = {
            defaults: {},
            exceptions: {},
          } as typeof draft.permissions;
        }
        if (!draft.permissions.exceptions) {
          draft.permissions.exceptions =
            {} as typeof draft.permissions.exceptions;
        }
        if (!draft.permissions.exceptions[permissionType]) {
          draft.permissions.exceptions[permissionType] = {};
        }

        if (settingValue === -1) {
          // Remove the override (set to default)
          delete draft.permissions.exceptions[permissionType][host];
        } else {
          // Set the override
          draft.permissions.exceptions[permissionType][host] = {
            setting: settingValue as PermissionSetting,
            lastModified: Date.now(),
          };
        }
      });

      await updatePreferences(patches);
    },
    [preferences, updatePreferences, host],
  );

  // Permissions that require device selection - "Allow" doesn't make sense
  const deviceSelectionPermissions: ConfigurablePermissionType[] = [
    'bluetooth',
    'hid',
    'serial',
    'usb',
  ];

  // Options for the select dropdown
  const getSettingOptions = useCallback(
    (permissionType: ConfigurablePermissionType) => {
      const defaultSetting = getDefaultSetting(permissionType);
      const defaultLabel = permissionSettingLabels[defaultSetting];
      const isDevicePermission =
        deviceSelectionPermissions.includes(permissionType);

      const options = [
        {
          value: '-1',
          label: 'Default',
          description: `Use global default (${defaultLabel})`,
        },
        {
          value: String(PermissionSetting.Ask),
          label: 'Ask',
          description: 'Ask every time',
        },
      ];

      // Only add "Allow" for non-device permissions
      if (!isDevicePermission) {
        options.push({
          value: String(PermissionSetting.Allow),
          label: 'Allow',
          description: 'Always allow for this site',
        });
      }

      options.push({
        value: String(PermissionSetting.Block),
        label: 'Block',
        description: 'Always block for this site',
      });

      return options;
    },
    [getDefaultSetting],
  );

  // Count how many overrides are set for this host
  const overrideCount = configurablePermissionTypes.filter(
    (type) => getHostSetting(type) !== -1,
  ).length;

  if (!host) {
    return (
      <div className="flex h-full w-full flex-col">
        {/* Header */}
        <div className="flex items-center border-border/30 border-b px-6 py-4">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate({ to: '/browsing-settings' })}
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <h1 className="font-semibold text-foreground text-xl">
              Website Permissions
            </h1>
          </div>
        </div>

        {/* Content */}
        <div className="scrollbar-subtle flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl">
            <p className="text-muted-foreground">
              No website selected. Please select a website from the Browsing
              Settings page.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="flex items-center border-border/30 border-b px-6 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate({ to: '/browsing-settings' })}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <div className="flex flex-col">
            <h1 className="font-semibold text-foreground text-xl">
              Website Permissions
            </h1>
            <span className="text-muted-foreground text-sm">{host}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-subtle flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Summary */}
          <div className="rounded-lg border border-border/30 bg-surface-1/50 p-4">
            <p className="text-muted-foreground text-sm">
              {overrideCount === 0 ? (
                'No custom permissions set for this site. All permissions use global defaults.'
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {overrideCount}
                  </span>{' '}
                  custom permission{overrideCount !== 1 ? 's' : ''} set for this
                  site.
                </>
              )}
            </p>
          </div>

          {/* Permission Settings */}
          <section className="space-y-4">
            <div>
              <h2 className="font-medium text-foreground text-lg">
                Permission Settings
              </h2>
              <p className="text-muted-foreground text-sm">
                Configure how this site can access browser features.
              </p>
            </div>

            <div className="space-y-3">
              {configurablePermissionTypes.map((permissionType) => {
                const currentSetting = getHostSetting(permissionType);
                const isOverridden = currentSetting !== -1;

                return (
                  <div
                    key={permissionType}
                    className={`flex items-center justify-between gap-4 rounded-lg border p-3 transition-colors ${
                      isOverridden
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/30'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground text-sm">
                        {permissionTypeLabels[permissionType]}
                      </span>
                      {isOverridden && (
                        <span className="text-primary text-xs">
                          Custom setting
                        </span>
                      )}
                    </div>
                    <Select
                      value={String(currentSetting)}
                      onValueChange={(value) =>
                        handlePermissionChange(permissionType, value)
                      }
                      triggerVariant="secondary"
                      size="sm"
                      triggerClassName="w-32"
                      items={getSettingOptions(permissionType)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
