import { useMemo } from 'react';
import {
  IconBrainNodesFillDuo18,
  IconDownloadFillDuo18,
  IconGear3FillDuo18,
  IconHistoryFillDuo18,
  IconNoteFillDuo18,
  IconSpace3dFillDuo18,
} from 'nucleo-ui-fill-duo-18';
import { IconKeyOutline18, IconServerOutline18 } from 'nucleo-ui-outline-18';
import type { SettingCommandItem } from '../command-center-model';
import {
  commandCenterSettings,
  type CommandCenterSettingDefinition,
} from '../command-center-settings';
import { filterAndRankCommandCenterItems } from '../command-center-search';

function iconForSetting(setting: CommandCenterSettingDefinition) {
  const className = 'size-4';
  switch (setting.iconName) {
    case 'models':
      return <IconBrainNodesFillDuo18 className={className} />;
    case 'key':
      return <IconKeyOutline18 className={className} />;
    case 'provider':
      return <IconServerOutline18 className={className} />;
    case 'context':
      return <IconNoteFillDuo18 className={className} />;
    case 'plugins':
      return <IconSpace3dFillDuo18 className={`${className} rotate-180`} />;
    case 'history':
      return <IconHistoryFillDuo18 className={className} />;
    case 'downloads':
      return <IconDownloadFillDuo18 className={className} />;
    case 'settings':
    case 'browser':
      return <IconGear3FillDuo18 className={className} />;
  }
}

export function useSettingsCommandItems(query: string) {
  const allItems = useMemo<SettingCommandItem[]>(
    () =>
      commandCenterSettings.map((setting) => ({
        ...setting,
        kind: 'setting',
        mode: 'settings',
        icon: iconForSetting(setting),
      })),
    [],
  );

  const items = useMemo(
    () => filterAndRankCommandCenterItems(allItems, query),
    [allItems, query],
  );

  return { items };
}
