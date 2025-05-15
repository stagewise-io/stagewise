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
import { GripVertical } from 'lucide-react';
import { ToolbarChatBox } from '../chat-box';
import { ToolbarMoreActionsButton } from '../more-actions-button';
import { useDraggable } from '@/hooks/use-draggable';
import { useContext } from 'preact/hooks';
import { DraggableContext } from '@/hooks/use-draggable';
import type { DraggableContextType } from '@/hooks/use-draggable';
import { usePlugins } from '@/hooks/use-plugins';
import { ToolbarSection } from '../section';

export function ToolbarDraggableBox() {
  const provider = useContext(DraggableContext) as DraggableContextType | null;
  const borderLocation = provider?.borderLocation;
  const isReady =
    !!borderLocation &&
    borderLocation.right - borderLocation.left > 0 &&
    borderLocation.bottom - borderLocation.top > 0;

  const draggable = useDraggable({
    startThreshold: 10,
    initialSnapArea: 'bottomCenter',
  });
  if (!isReady) return null; // Wait until borderLocation is valid

  const plugins = usePlugins();

  return (
    <div
      ref={draggable.draggableRef}
      className="pointer-events-auto absolute p-0.5"
    >
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div className="pointer-events-auto flex w-min max-w-[80vw] flex-col items-stretch justify-center rounded-3xl border border-border/30 border-solid bg-zinc-50/80 p-0 shadow-lg backdrop-blur-lg transition-colors">
        {/* <ToolbarDraggingGrip /> */}
        {/* If the app state is right, we also render the button that enables dragging the toolbar around */}
        <div
          ref={draggable.handleRef}
          className="flex w-fit flex-row items-center justify-center rounded-3xl border-border/30 border-t bg-background/40 p-1.5 shadow-lg transition-colors first:border-none"
        >
          <ToolbarSection>
            <ToolbarChatBox />
          </ToolbarSection>
          {Object.values(plugins.pluginToolbarActions).length > 0 && (
            <ToolbarSection>
              {Object.entries(plugins.pluginToolbarActions).map(
                ([key, Action]) => (
                  <Action key={key} />
                ),
              )}
            </ToolbarSection>
          )}
          <ToolbarSection>
            <ToolbarMoreActionsButton />
          </ToolbarSection>
        </div>
      </div>
    </div>
  );
}

export function ToolbarDraggingGrip(props: object) {
  return (
    <Button
      {...props}
      className="flex h-8 w-6 shrink-0 cursor-grab items-center justify-center bg-transparent focus:cursor-grabbing"
    >
      <GripVertical className="size-5 text-border/60" />
    </Button>
  );
}
