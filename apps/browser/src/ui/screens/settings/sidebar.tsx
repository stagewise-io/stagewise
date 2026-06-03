import { useCallback } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@ui/utils';
import { useKartonProcedure, useKartonState } from '@ui/hooks/use-karton';
import { useUiZoomCounterScale } from '@ui/hooks/use-ui-zoom-counter-scale';
import {
  TITLEBAR_HEIGHT,
  TITLEBAR_ICON_OPTICAL_OFFSET,
} from '@shared/titlebar';
import { SidebarTitlebarRow } from '../main/_components/sidebar-titlebar-row';
import {
  SETTINGS_NAV_GROUPS,
  getSettingsSectionLabel,
  isSectionActive,
} from './settings-route';
import type { SettingsRootSection } from './settings-route';

export function SettingsSidebar() {
  const counterScale = useUiZoomCounterScale();
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const activeRoute = useKartonState((s) => s.appScreen.settingsRoute);
  const setSettingsRoute = useKartonProcedure(
    (p) => p.appScreen.setSettingsRoute,
  );
  const closeSettings = useKartonProcedure((p) => p.appScreen.closeSettings);

  const handleSelectSection = useCallback(
    (section: SettingsRootSection) => {
      setSettingsRoute({ section });
    },
    [setSettingsRoute],
  );

  return (
    <div className="flex h-full flex-col items-stretch">
      <SidebarTitlebarRow absolute showSidebarToggle={false}>
        <div className="pl-2">
          <Button
            variant="ghost"
            size="sm"
            className="app-no-drag shrink-0 px-1.5"
            style={
              isMacOs ? { marginTop: TITLEBAR_ICON_OPTICAL_OFFSET } : undefined
            }
            onClick={() => closeSettings()}
          >
            ← Back
          </Button>
        </div>
      </SidebarTitlebarRow>
      <div
        className="flex h-full flex-col items-stretch p-2"
        style={{ paddingTop: (TITLEBAR_HEIGHT + 8) * counterScale }}
      >
        {/* Navigation groups */}
        <nav className="flex flex-1 flex-col gap-px pt-2 pr-1.5 pb-3.5 pl-0.5">
          {SETTINGS_NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col gap-px pt-4 first:pt-0">
              {group.label && (
                <div className="shrink-0 px-1.5 pb-1 font-normal text-sidebar-foreground text-xs">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const active = isSectionActive(item.section, activeRoute);
                return (
                  <button
                    key={item.section}
                    type="button"
                    className={cn(
                      'app-no-drag flex h-8 w-full cursor-pointer flex-row items-center gap-2 rounded-lg px-1.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-foreground/5 text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/8 hover:text-foreground',
                    )}
                    onClick={() => handleSelectSection(item.section)}
                  >
                    {item.icon}
                    <span className="truncate">
                      {getSettingsSectionLabel(item.section)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
