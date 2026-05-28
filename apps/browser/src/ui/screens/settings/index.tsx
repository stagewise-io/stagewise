import {
  ResizablePanelGroup,
  ResizableHandle,
  ResizablePanel,
} from '@stagewise/stage-ui/components/resizable';
import { cn } from '@ui/utils';
import { useKartonState } from '@ui/hooks/use-karton';
import { SettingsSidebar } from './sidebar';
import { SettingsContent } from './content';
import {
  CommandCenter,
  CommandCenterHotkeys,
  CommandCenterProvider,
} from '../main/command-center';

// Reuse the same autoSaveId as the main screen so the root panel layout
// (sidebar width, content width) persists when switching between screens.
const rootLayoutStorageKey = 'stagewise-panel-layout-root';

export function SettingsScreen() {
  const isMacOs = useKartonState((s) => s.appInfo.platform === 'darwin');
  const isFullScreen = useKartonState((s) => s.appInfo.isFullScreen);

  return (
    <CommandCenterProvider>
      <CommandCenterHotkeys />
      <CommandCenter />
      <div className="root pointer-events-auto relative inset-0 flex size-full flex-row items-stretch justify-between">
        {/* macOS titlebar drag zone */}
        {isMacOs && !isFullScreen && (
          <div className="app-drag absolute top-0 left-0 -z-10 h-8 w-full" />
        )}
        <ResizablePanelGroup
          direction="horizontal"
          autoSaveId={rootLayoutStorageKey}
          className="overflow-visible! h-full w-full"
        >
          <ResizablePanel
            id="new-sidebar-panel"
            order={0}
            defaultSize={6}
            minSize={6}
            maxSize={50}
            className={cn(
              '@container group overflow-visible! relative flex h-full min-w-44 max-w-2xl flex-col items-stretch',
            )}
          >
            <SettingsSidebar />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel
            id="content-panel"
            order={1}
            defaultSize={65}
            className={cn(
              'relative h-full overflow-hidden rounded-l-xl bg-background ring-1 ring-derived-subtle',
              !isMacOs && 'mt-px',
            )}
          >
            <SettingsContent />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </CommandCenterProvider>
  );
}
