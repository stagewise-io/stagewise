import {
  ResizablePanel,
  type ImperativePanelHandle,
} from '@stagewise/stage-ui/components/resizable';
import { useRef, useCallback } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import { IconGear2Outline18 } from 'nucleo-ui-outline-18';
import { AgentsList } from './agents-list';
import {
  Tooltip,
  TooltipTrigger,
} from '@stagewise/stage-ui/components/tooltip';
import { SETTINGS_PAGE_URL } from '@shared/internal-urls';
import { useTrack } from '@ui/hooks/use-track';
import { useKartonProcedure } from '@ui/hooks/use-karton';

export function Sidebar() {
  const panelRef = useRef<ImperativePanelHandle>(null);

  const track = useTrack();
  const createTab = useKartonProcedure((p) => p.browser.createTab);

  const handleOpenSettings = useCallback(() => {
    track('settings-opened');
    createTab(SETTINGS_PAGE_URL, true);
  }, [createTab, track]);

  return (
    <ResizablePanel
      ref={panelRef}
      id="new-sidebar-panel"
      order={0}
      defaultSize={35}
      minSize={20}
      maxSize={30}
      className="@container group overflow-visible! flex h-full min-w-64 max-w-96 flex-col items-stretch p-2"
    >
      <div className="app-drag flex h-8 w-full flex-row items-center justify-end" />
      <AgentsList />
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-row items-center justify-center gap-1.5 pb-0.5 pl-1">
          <div className="size-8 rounded-full bg-surface-3" />
          <div className="flex flex-col gap-px">
            <span className="font-medium text-foreground text-sm">
              John Doe
            </span>
            <span className="text-muted-foreground text-xs">
              john.doe@example.com
            </span>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-sm"
              className="app-no-drag shrink-0"
              onClick={handleOpenSettings}
            >
              <IconGear2Outline18 className="size-4" />
            </Button>
          </TooltipTrigger>
        </Tooltip>
      </div>
    </ResizablePanel>
  );
}
