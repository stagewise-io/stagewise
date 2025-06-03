// This component represents the box in which the toolbar is placed.
// It is only used in desktop cases, since the mobile toolbar is placed inside a modal card.

import { Button } from '@headlessui/react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MessageCircleIcon,
  PuzzleIcon,
  RefreshCwIcon,
  WifiOffIcon,
} from 'lucide-react';
import { ToolbarChatArea } from '../chat-box';
import { useDraggable } from '@/hooks/use-draggable';
import { useContext, useEffect, useState } from 'preact/hooks';
import { DraggableContext } from '@/hooks/use-draggable';
import type { DraggableContextType } from '@/hooks/use-draggable';
import { usePlugins } from '@/hooks/use-plugins';
import { ToolbarSection } from '../section';
import { ToolbarButton } from '../button';
import { useChatState } from '@/hooks/use-chat-state';
import { cn } from '@/utils';
import { useAppState } from '@/hooks/use-app-state';
import { Logo } from '@/components/ui/logo';
import type { VNode } from 'preact';
import { SettingsButton, SettingsPanel } from '../settings';
import { useVSCode } from '@/hooks/use-vscode';
import { DisconnectedStatePanel } from './panels/disconnected';

// Subcomponent for loading state content
function LoadingStateContent() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/90 p-4 shadow-lg backdrop-blur">
      <div className="mb-3 flex items-center gap-3">
        <RefreshCwIcon className="size-5 animate-spin text-blue-600" />
        <h3 className="font-semibold text-blue-800">Connecting...</h3>
      </div>

      <div className="text-blue-700 text-sm">
        <p>Looking for VS Code windows...</p>
      </div>
    </div>
  );
}

// Subcomponent for connected state toolbar buttons
function ConnectedStateButtons({
  handleButtonClick,
  pluginBox,
  setPluginBox,
  openPanel,
  setOpenPanel,
  chatState,
}: {
  handleButtonClick: (handler: () => void) => (e: MouseEvent) => void;
  pluginBox: null | {
    component: VNode;
    pluginName: string;
  };
  setPluginBox: (value: typeof pluginBox) => void;
  openPanel: null | 'settings' | { pluginName: string; component: VNode };
  setOpenPanel: (value: typeof openPanel) => void;
  chatState: ReturnType<typeof useChatState>;
}) {
  const plugins = usePlugins();

  const pluginsWithActions = plugins.plugins.filter(
    (plugin) => plugin.onActionClick,
  );

  // Handler for settings button
  const handleOpenSettings = () =>
    setOpenPanel(openPanel === 'settings' ? null : 'settings');

  return (
    <>
      <SettingsButton
        onOpenPanel={handleOpenSettings}
        isActive={openPanel === 'settings'}
      />
      {pluginsWithActions.length > 0 && (
        <ToolbarSection>
          {pluginsWithActions.map((plugin) => (
            <ToolbarButton
              key={plugin.pluginName}
              onClick={handleButtonClick(() => {
                if (pluginBox?.pluginName !== plugin.pluginName) {
                  const component = plugin.onActionClick();

                  if (component) {
                    setPluginBox({
                      component: plugin.onActionClick(),
                      pluginName: plugin.pluginName,
                    });
                  }
                } else {
                  setPluginBox(null);
                }
              })}
              active={pluginBox?.pluginName === plugin.pluginName}
            >
              {plugin.iconSvg ? (
                <span className="size-4 stroke-zinc-950 text-zinc-950 *:size-full">
                  {plugin.iconSvg}
                </span>
              ) : (
                <PuzzleIcon className="size-4" />
              )}
            </ToolbarButton>
          ))}
        </ToolbarSection>
      )}
      <ToolbarSection>
        <ToolbarButton
          onClick={handleButtonClick(() =>
            chatState.isPromptCreationActive
              ? chatState.stopPromptCreation()
              : chatState.startPromptCreation(),
          )}
          active={chatState.isPromptCreationActive}
        >
          <MessageCircleIcon className="size-4 stroke-zinc-950" />
        </ToolbarButton>
      </ToolbarSection>
    </>
  );
}

export function ToolbarDraggableBox() {
  const provider = useContext(DraggableContext) as DraggableContextType | null;
  const borderLocation = provider?.borderLocation;
  const isReady =
    !!borderLocation &&
    borderLocation.right - borderLocation.left > 0 &&
    borderLocation.bottom - borderLocation.top > 0;

  const draggable = useDraggable({
    startThreshold: 10,
    initialSnapArea: 'bottomRight',
  });

  const { windows, isDiscovering, discoveryError, discover } = useVSCode();
  const isConnected = windows.length > 0;

  const [pluginBox, setPluginBox] = useState<null | {
    component: VNode;
    pluginName: string;
  }>(null);
  const [openPanel, setOpenPanel] = useState<
    null | 'settings' | { pluginName: string; component: VNode }
  >(null);

  const chatState = useChatState();

  const minimized = useAppState((state) => state.minimized);
  const minimize = useAppState((state) => state.minimize);
  const expand = useAppState((state) => state.expand);

  useEffect(() => {
    if (minimized) {
      setPluginBox(null);
      setOpenPanel(null);
    }
  }, [minimized]);

  // Create a wrapper function to handle button clicks
  const handleButtonClick = (handler: () => void) => (e: MouseEvent) => {
    // If we just finished dragging, prevent the click
    if (draggable.wasDragged) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    handler();
  };

  if (!isReady) return null; // Wait until borderLocation is valid

  // Determine which theme and content to show
  const isLoadingState = isDiscovering;
  const isDisconnectedState = !isConnected && !isDiscovering;
  const isConnectedState = isConnected;

  // Theme classes based on state
  const getThemeClasses = () => {
    if (isLoadingState) {
      return {
        border: 'border-blue-300',
        bg: 'bg-blue-100/80',
        divideBorder: 'divide-blue-200',
        buttonBg: 'from-blue-600 to-sky-600',
        buttonColor: 'text-blue-700',
      };
    }
    if (isDisconnectedState) {
      return {
        border: 'border-orange-300',
        bg: 'bg-orange-100/80',
        divideBorder: 'divide-orange-200',
        buttonBg: 'from-orange-600 to-red-600',
        buttonColor: 'text-orange-700',
      };
    }
    // Connected state (default)
    return {
      border: 'border-border/30',
      bg: 'bg-zinc-50/80',
      divideBorder: 'divide-border/20',
      buttonBg: 'from-sky-700 to-fuchsia-700',
      buttonColor: 'stroke-zinc-950',
    };
  };

  const theme = getThemeClasses();

  // Get the appropriate icon for the minimized state
  const getMinimizedIcon = () => {
    if (isLoadingState) {
      return <RefreshCwIcon className="size-4 animate-spin text-white" />;
    }
    if (isDisconnectedState) {
      return <WifiOffIcon className="size-4 text-white" />;
    }
    return <Logo className="size-4.5" color="white" />;
  };

  return (
    <div ref={draggable.draggableRef} className="absolute p-0.5">
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div
        className={cn(
          'absolute flex h-[calc(100vh-32px)] w-96 max-w-[40vw] items-stretch justify-end transition-all duration-300 ease-out',
          draggable.position.isTopHalf
            ? 'top-0 flex-col-reverse'
            : 'bottom-0 flex-col',
          draggable.position.isLeftHalf ? 'left-[100%]' : 'right-[100%]',
        )}
      >
        {/* This is the plugin box / info panel. Content varies by state. */}
        <div
          className={cn(
            'flex min-h-0 flex-1 origin-bottom-right flex-col items-stretch px-2 transition-all duration-300 ease-out',
            (pluginBox || openPanel === 'settings' || !isConnectedState) &&
              !minimized
              ? 'pointer-events-auto scale-100 opacity-100 blur-none'
              : 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
            draggable.position.isTopHalf ? 'justify-start' : 'justify-end',
            draggable.position.isTopHalf
              ? draggable.position.isLeftHalf
                ? 'origin-top-left'
                : 'origin-top-right'
              : draggable.position.isLeftHalf
                ? 'origin-bottom-left'
                : 'origin-bottom-right',
          )}
        >
          {/* Render content based on state */}
          {isLoadingState && <LoadingStateContent />}
          {isDisconnectedState && (
            <DisconnectedStatePanel
              discover={discover}
              discoveryError={discoveryError}
            />
          )}
          {isConnectedState && openPanel === 'settings' && (
            <SettingsPanel onClose={() => setOpenPanel(null)} />
          )}
          {isConnectedState && pluginBox?.component}
        </div>

        {/* This is the chat area. Only visible when connected and prompt creation is active. */}
        {isConnectedState && (
          <div
            className={cn(
              'z-20 w-full px-2 transition-all duration-300 ease-out',
              chatState.isPromptCreationActive && !minimized
                ? 'pointer-events-auto scale-100 opacity-100 blur-none'
                : 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
              draggable.position.isTopHalf ? 'mb-2' : 'mt-2',
              draggable.position.isTopHalf
                ? draggable.position.isLeftHalf
                  ? 'origin-top-left'
                  : 'origin-top-right'
                : draggable.position.isLeftHalf
                  ? 'origin-bottom-left'
                  : 'origin-bottom-right',
            )}
          >
            <ToolbarChatArea />
          </div>
        )}
      </div>

      {/* Main toolbar handle */}
      <div
        ref={draggable.handleRef}
        className={cn(
          'pointer-events-auto z-50 rounded-full border px-0.5 shadow-md backdrop-blur transition-all duration-300 ease-out',
          theme.border,
          theme.bg,
          draggable.position.isTopHalf
            ? 'flex-col-reverse divide-y-reverse'
            : 'flex-col',
          minimized ? 'h-9.5 w-9.5' : 'h-[calc-size(auto,size)] h-auto w-auto',
        )}
      >
        {/* Minimized state button */}
        <Button
          onClick={() => expand()}
          className={cn(
            'absolute right-0 left-0 z-50 flex size-9 origin-center cursor-pointer items-center justify-center rounded-full bg-gradient-to-tr transition-all duration-300 ease-out',
            theme.buttonBg,
            minimized
              ? 'pointer-events-auto scale-100 opacity-100 blur-none'
              : 'pointer-events-none scale-25 opacity-0 blur-md',
            draggable.position.isTopHalf ? 'top-0' : 'bottom-0',
          )}
        >
          {getMinimizedIcon()}
        </Button>

        {/* Expanded toolbar content */}
        <div
          className={cn(
            'flex h-[calc-size(auto)] scale-100 items-center justify-center divide-y transition-all duration-300 ease-out',
            theme.divideBorder,
            draggable.position.isTopHalf
              ? 'origin-top flex-col-reverse divide-y-reverse'
              : 'origin-bottom flex-col',
            minimized && 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
          )}
        >
          {/* Show different buttons based on state */}
          {isConnectedState && (
            <ConnectedStateButtons
              handleButtonClick={handleButtonClick}
              pluginBox={pluginBox}
              setPluginBox={setPluginBox}
              openPanel={openPanel}
              setOpenPanel={setOpenPanel}
              chatState={chatState}
            />
          )}

          {(isLoadingState || isDisconnectedState) && (
            <ToolbarSection>
              <ToolbarButton
                onClick={isDisconnectedState ? () => discover() : undefined}
                className={cn(
                  theme.buttonColor,
                  isDisconnectedState && 'hover:bg-orange-200',
                )}
              >
                {isLoadingState && (
                  <RefreshCwIcon className="size-4 animate-spin" />
                )}
                {isDisconnectedState && <RefreshCwIcon className="size-4" />}
              </ToolbarButton>
            </ToolbarSection>
          )}

          {/* Minimize button - always present */}
          <ToolbarSection>
            <ToolbarButton
              onClick={handleButtonClick(() => minimize())}
              className={cn(
                'h-5',
                theme.buttonColor,
                draggable.position.isTopHalf
                  ? 'rounded-t-3xl rounded-b-lg'
                  : 'rounded-t-lg rounded-b-3xl',
              )}
            >
              {draggable.position.isTopHalf ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </ToolbarButton>
          </ToolbarSection>
        </div>
      </div>
    </div>
  );
}
