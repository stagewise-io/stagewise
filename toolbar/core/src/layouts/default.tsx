// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { cn } from '@/utils';
import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { useMemo } from 'react';
import { usePanels } from '@/hooks/use-panels';
import { SettingsPanel } from '@/panels/settings';
import { ChatPanel } from '@/panels/chat';
import { usePlugins } from '@/hooks/use-plugins';
import { Logo } from '@/components/ui/logo';
import { AnimatedGradientBackground } from '@/components/ui/animated-gradient-background';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@stagewise/stage-ui/components/resizable';
import { Button } from '@stagewise/stage-ui/components/button';
import { CogIcon, MessageCircleIcon } from 'lucide-react';
import { useKartonState } from '@/hooks/use-karton';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
} from '@stagewise/stage-ui/components/popover';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@stagewise/stage-ui/components/dialog';

export function DefaultLayout({ mainApp }: { mainApp: React.ReactNode }) {
  const { leftPanelContent, toggleLeftPanel } = usePanels();

  const workspaceInfo = useKartonState((s) => s.workspaceInfo);

  const isAuthenticated = useKartonState((s) => s.authStatus.isAuthenticated);

  const workspaceDir = useMemo(() => {
    return workspaceInfo
      ? workspaceInfo.path
          .replace('\\', '/')
          .split('/')
          .filter((p) => p !== '')
          .pop()
      : null;
  }, [workspaceInfo]);

  return (
    <div className="root fixed inset-0 flex size-full flex-col items-stretch justify-between bg-zinc-100 p-2 child:pb-2 dark:bg-zinc-900">
      {/* Top info bar */}
      <div className="mb-2 flex h-fit min-h-8 w-full flex-row items-stretch justify-between gap-12">
        {/* Upper left control area */}
        <div className="flex shrink basis-1/3 flex-row items-center justify-start gap-2 pl-1" />

        {/* Upper center info area */}
        <div className="flex flex-1 basis-1/3 flex-row items-center justify-center">
          <Popover>
            <PopoverTrigger>
              <Button size="sm" variant="ghost" className="rounded-full">
                {workspaceDir ?? 'No workspace loaded'}
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <PopoverTitle>Workspace Info</PopoverTitle>

              <div className="flex flex-col gap-0">
                <h3 className="font-medium text-sm">Path</h3>
                <p className="text-foreground/70 text-sm">
                  {workspaceInfo?.path}
                </p>
              </div>

              <div className="flex flex-col gap-0">
                <h3 className="font-medium text-sm">Dev App Port</h3>
                <p className="font-mono text-foreground/70 text-sm">
                  {workspaceInfo?.devAppPort}
                </p>
              </div>

              <div className="flex flex-col gap-0">
                <h3 className="font-medium text-sm">Loaded Plugins</h3>
                <p className="text-foreground/70 text-sm">
                  {workspaceInfo?.loadedPlugins.join(', ')}
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Upper right control area */}
        <div className="flex flex-1 basis-1/3 flex-row items-center justify-end gap-2 pr-1">
          <div className="rounded-full border border-zinc-500/20 bg-white/60 px-1.5 py-0.5 font-medium text-blue-700 text-xs shadow-sm">
            Beta
          </div>
          <div className="flex size-8 items-center justify-center overflow-hidden rounded-full shadow-lg ring-1 ring-black/10 ring-inset">
            <AnimatedGradientBackground className="-z-10 absolute inset-0 size-full" />
            <Logo color="white" className="mr-px mb-px size-1/2 shadow-2xs" />
          </div>
        </div>
      </div>

      {/* Center main content area */}
      <div className={cn('flex flex-1 flex-row items-stretch justify-between')}>
        {/* Left sidebar area */}

        <div className="flex w-fit flex-none flex-col items-center justify-center gap-2 pr-2">
          <Button
            variant={leftPanelContent === 'chat' ? 'primary' : 'secondary'}
            size="icon-md"
            onClick={() => toggleLeftPanel('chat')}
          >
            <MessageCircleIcon className="mb-0.5 ml-px size-5 stroke-2" />
          </Button>
          <Button
            variant={leftPanelContent === 'settings' ? 'primary' : 'secondary'}
            size="icon-md"
            onClick={() => toggleLeftPanel('settings')}
          >
            <CogIcon className="mb-0.5 ml-px size-5 stroke-2" />
          </Button>
        </div>

        {/* Open panel and web app area */}
        <div className="relative flex-1">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="stagewise-center-panel-layout"
          >
            {/* Open panel area */}
            {leftPanelContent && (
              <>
                <ResizablePanel
                  id="left-panel"
                  order={1}
                  minSize={20}
                  defaultSize={30}
                  maxSize={35}
                >
                  <OpenPanel />
                </ResizablePanel>
                <ResizableHandle />
              </>
            )}

            {/* Web app area */}
            <ResizablePanel id="main-app-panel" order={2} defaultSize={70}>
              <div className="relative size-full overflow-hidden rounded-xl border border-zinc-500/10">
                {mainApp}
                <DOMContextSelector />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* Bottom footer area */}
      <div className="flex min-h-0 flex-row items-stretch justify-between pt-2">
        {/* Lower left control area */}
        <div className="flex flex-1 basis-1/3 flex-row items-center justify-start" />

        {/* Lower right status area */}
        <div className="flex flex-1 basis-1/3 flex-row items-center justify-end gap-2" />
      </div>

      {/* Auth dialog */}
      <Dialog open={true} dismissible={false}>
        <DialogContent>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>Please login to continue</DialogDescription>
          <Button>Login</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * This component contains the panel area itself
 */
function OpenPanel() {
  const { leftPanelContent, leftPanelPluginName } = usePanels();

  const plugins = usePlugins();

  // Determine which panel content to show
  const panelContent = useMemo(() => {
    if (leftPanelContent === 'chat') {
      return <ChatPanel />;
    }
    if (leftPanelContent === 'settings') {
      return <SettingsPanel />;
    }
    if (leftPanelContent === 'plugin') {
      const plugin = plugins.plugins.find(
        (plugin) => plugin.pluginName === leftPanelPluginName,
      );
      if (plugin) {
        const panelResult = plugin.onActionClick();
        if (panelResult) {
          return panelResult;
        }
      }
    }
    return null;
  }, [leftPanelContent, leftPanelPluginName, plugins]);

  return panelContent;
}
