import { ResizablePanel } from '@stagewise/stage-ui/components/resizable';
import { AppWindowMacIcon, SettingsIcon, WandSparklesIcon } from 'lucide-react';

import { DevAppPreviewPanel } from './panels/dev-app-preview';
import { IdeationCanvasPanel } from './panels/ideation-canvas';
import { SettingsPanel } from './panels/settings';

import { DevAppPreviewControls } from './controls/dev-app-preview';
import { IdeationCanvasControls } from './controls/ideation-canvas';
import { SettingsControls } from './controls/settings';

import { useCallback, useRef } from 'react';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { Button } from '@stagewise/stage-ui/components/button';
import { useKartonProcedure, useKartonState } from '@/hooks/use-karton';
import { MainTab } from '@stagewise/karton-contract';

type Tab = {
  title: string;
  icon: React.ReactNode;
  mainContent: React.ReactNode;
  controls: React.ReactNode | null;
  showInTabBar: boolean;
  disabled: boolean;
  hideTabBar: boolean;
};
type Tabs = Record<MainTab, Tab>;

const tabs: Tabs = {
  [MainTab.DEV_APP_PREVIEW]: {
    title: 'Preview',
    icon: <AppWindowMacIcon className="mb-0.5 ml-px size-4" />,
    mainContent: <DevAppPreviewPanel />,
    controls: <DevAppPreviewControls />,
    showInTabBar: true,
    disabled: false,
    hideTabBar: false,
  },
  [MainTab.IDEATION_CANVAS]: {
    title: 'Playground',
    icon: <WandSparklesIcon className="ml-px size-4" />,
    mainContent: <IdeationCanvasPanel />,
    controls: <IdeationCanvasControls />,
    showInTabBar: true,
    disabled: false,
    hideTabBar: false,
  },
  [MainTab.SETTINGS]: {
    title: 'Settings',
    icon: <SettingsIcon className="ml-px size-4" />,
    mainContent: <SettingsPanel />,
    controls: <SettingsControls />,
    showInTabBar: true,
    disabled: false,
    hideTabBar: false,
  },
};

export function MainSection() {
  const activeTab = useKartonState((s) =>
    s.userExperience.activeLayout === 'main'
      ? s.userExperience.activeMainTab
      : null,
  );
  const setActiveTab = useKartonProcedure(
    (p) => p.userExperience.mainLayout.changeTab,
  );

  const prevIndexRef = useRef<number>(0);
  const activeIndexRef = useRef<number>(0);

  const changeTab = useCallback(
    (tabId: keyof Tabs) => {
      prevIndexRef.current = Object.entries(tabs).findIndex(
        ([id, _]) => id === activeTab,
      );
      activeIndexRef.current = Object.entries(tabs).findIndex(
        ([id, _]) => id === tabId,
      );
      setActiveTab(tabId);
    },
    [activeTab],
  );

  return (
    <ResizablePanel
      id="opened-content-panel"
      order={2}
      defaultSize={70}
      className="flex h-full flex-1 flex-col items-stretch justify-between gap-4 p-4"
    >
      {/* Tab navigation and controls area */}
      <div
        className={cn(
          'flex flex-row items-center justify-between gap-6',
          activeTab &&
            tabs[activeTab].hideTabBar &&
            !tabs[activeTab].controls &&
            'hidden',
        )}
      >
        {/* Tab navigation buttons */}
        <div
          className={cn(
            '-ml-0.5 glass-inset flex w-auto shrink-0 flex-row items-center justify-between gap-2 overflow-hidden rounded-full p-1',
            activeTab &&
              tabs[activeTab].hideTabBar &&
              'pointer-events-none opacity-0',
          )}
        >
          {Object.entries(tabs)
            .filter(([_, tab]) => tab.showInTabBar)
            .map(([tabId, tab]) => (
              <Button
                className={cn(
                  'w-[calc-size(auto,size)] min-w-10 rounded-full transition-all duration-200 ease-out',
                )}
                variant={activeTab === tabId ? 'primary' : 'ghost'}
                size={activeTab === tabId ? 'md' : 'icon-md'}
                onClick={() => changeTab(tabId as MainTab)}
                disabled={tab.disabled}
              >
                {tab.icon}
                <span
                  className={cn(
                    'whitespace-nowrap',
                    activeTab !== tabId && 'w-0 overflow-hidden',
                  )}
                >
                  {tab.title}
                </span>
              </Button>
            ))}
        </div>

        {/* Controls area */}
        <div className="flex flex-row items-center gap-2">
          {Object.entries(tabs).map(([tabId, tab]) => (
            <div
              key={tabId}
              className={cn(
                '-translate-y-1/2 absolute top-1/2 right-0 origin-center transition-all duration-300 ease-out',
                activeTab === tabId
                  ? 'scale-100 opacity-100 blur-none'
                  : 'pointer-events-none scale-90 opacity-0 blur-sm',
              )}
            >
              {tab.controls}
            </div>
          ))}
        </div>
      </div>

      {/* Main content boxes. They're big cards that move around and resize themselves. */}
      <div className="flex-1">
        {Object.entries(tabs).map(([tabId, tab], index) => (
          <div
            key={tabId}
            className={cn(
              'absolute inset-0 size-full transition-all duration-300 ease-out',
              activeTab === tabId
                ? 'z-40 scale-y-100 opacity-100 blur-none'
                : 'z-30 scale-y-90 opacity-0 blur-sm',
              index > prevIndexRef.current ? 'origin-bottom' : 'origin-top',
              activeTab !== tabId &&
                (activeIndexRef.current >
                Object.entries(tabs).findIndex(([id, _]) => id === tabId)
                  ? '-translate-y-6'
                  : 'translate-y-6'),
            )}
          >
            {tab.mainContent}
          </div>
        ))}
      </div>
    </ResizablePanel>
  );
}
