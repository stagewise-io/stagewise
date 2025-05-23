// SPDX-License-Identifier: AGPL-3.0-only
// Draggable box component for the toolbar
// Copyright (C) 2025 Goetze, Scharpff & Toews GbR

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// This component represents the box in which the toolbar is placed.
// It is only used in desktop cases, since the mobile toolbar is placed inside a modal card.

import { Button } from '@headlessui/react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  MessageCircleIcon,
  PuzzleIcon,
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

  const plugins = usePlugins();

  const pluginsWithActions = plugins.plugins.filter(
    (plugin) => plugin.onActionClick,
  );

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

  // Handler for settings button
  const handleOpenSettings = () =>
    setOpenPanel(openPanel === 'settings' ? null : 'settings');

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
        {/* This is the plugin box. It is only visible when a plugin is selected. */}
        <div
          className={cn(
            'flex min-h-0 flex-1 origin-bottom-right flex-col items-stretch px-2 transition-all duration-300 ease-out',
            pluginBox || openPanel === 'settings'
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
          {openPanel === 'settings' ? (
            <SettingsPanel onClose={() => setOpenPanel(null)} />
          ) : (
            pluginBox?.component
          )}
        </div>
        {/* This is the chat area. It is only visible when the prompt creation is active. */}
        <div
          className={cn(
            'z-20 w-full px-2 transition-all duration-300 ease-out',
            chatState.isPromptCreationActive
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
      </div>
      <div
        ref={draggable.handleRef}
        className={cn(
          'pointer-events-auto z-50 rounded-full border border-border/30 bg-zinc-50/80 px-0.5 shadow-md backdrop-blur transition-all duration-300 ease-out',
          draggable.position.isTopHalf
            ? 'flex-col-reverse divide-y-reverse'
            : 'flex-col',
          minimized ? 'h-9.5 w-9.5' : 'h-[calc-size(auto,size)] h-auto w-auto',
        )}
      >
        <Button
          onClick={() => expand()}
          className={cn(
            'absolute right-0 left-0 z-50 flex size-9 origin-center cursor-pointer items-center justify-center rounded-full bg-gradient-to-tr from-sky-700 to-fuchsia-700 transition-all duration-300 ease-out',
            minimized
              ? 'pointer-events-auto scale-100 opacity-100 blur-none'
              : 'pointer-events-none scale-25 opacity-0 blur-md',
            draggable.position.isTopHalf ? 'top-0' : 'bottom-0',
          )}
        >
          <Logo className="size-4.5" color="white" />
        </Button>
        <div
          className={cn(
            'flex h-[calc-size(auto)] scale-100 items-center justify-center divide-y divide-border/20 transition-all duration-300 ease-out',
            draggable.position.isTopHalf
              ? 'origin-top flex-col-reverse divide-y-reverse'
              : 'origin-bottom flex-col',
            minimized && 'pointer-events-none h-0 scale-50 opacity-0 blur-md',
          )}
        >
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
          <ToolbarSection>
            <ToolbarButton
              onClick={handleButtonClick(() => minimize())}
              className={cn(
                'h-5',
                draggable.position.isTopHalf
                  ? 'rounded-t-3xl rounded-b-lg'
                  : 'rounded-t-lg rounded-b-3xl',
              )}
            >
              {draggable.position.isTopHalf ? (
                <ChevronUpIcon className="size-4 text-zinc-500/80" />
              ) : (
                <ChevronDownIcon className="size-4 text-zinc-500/80" />
              )}
            </ToolbarButton>
          </ToolbarSection>
        </div>
      </div>
    </div>
  );
}
