// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { cn } from '@/utils';
import { DOMContextSelector } from '@/components/dom-context-selector/selector-canvas';
import { ContextChipHoverProvider } from '@/hooks/use-context-chip-hover';
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
import { MessageCircleIcon } from 'lucide-react';

export function DefaultLayout({ mainApp }: { mainApp: React.ReactNode }) {
  const { leftPanelContent, toggleLeftPanel } = usePanels();

  return (
    <div className="root fixed inset-0 flex size-full flex-col items-stretch justify-between bg-zinc-100 p-2 child:pb-2 dark:bg-zinc-950">
      {/* Top info bar */}
      <div className="mb-2 flex h-fit min-h-8 w-full flex-row items-stretch justify-between gap-12">
        {/* Upper left control area */}
        <div className="flex shrink basis-1/3 flex-row items-center justify-start gap-2 pl-1" />

        {/* Upper center info area */}
        <div className="flex flex-1 basis-1/3 flex-row items-center justify-center">
          <span className="font-medium text-foreground/70 text-sm">
            Dummy workspace name
          </span>
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

        <div className="flex w-fit flex-none flex-col items-center justify-center pr-2">
          <Button
            variant={leftPanelContent === 'chat' ? 'primary' : 'secondary'}
            size="icon-md"
            onClick={() => toggleLeftPanel('chat')}
          >
            <MessageCircleIcon className="mb-0.5 ml-px size-5 stroke-2" />
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
              <div className="glass-body relative size-full overflow-hidden rounded-lg">
                <ContextChipHoverProvider>
                  {mainApp}
                  <DOMContextSelector />
                </ContextChipHoverProvider>
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
