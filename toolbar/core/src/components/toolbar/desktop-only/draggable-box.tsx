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
import { ChatArea } from '../chat-area';
import { ChatBox } from '../chat-box';
import { MoreActionsButton } from '../more-actions-button';
import { useDraggable } from '@/hooks/use-draggable';

export function ToolbarDraggableBox() {
  const draggable = useDraggable({
    startThreshold: 10,
  });
  return (
    <div
      ref={draggable.draggableRef}
      className="pointer-events-auto absolute p-0.5"
    >
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div className="pointer-events-auto flex w-96 max-w-[80vw] flex-col items-start justify-center rounded-3xl border border-border/30 border-solid bg-zinc-50/80 p-0 shadow-lg backdrop-blur-lg transition-colors">
        <ChatArea />
        {/* <ToolbarDraggingGrip /> */}
        {/* If the app state is right, we also render the button that enables dragging the toolbar around */}
        <div
          ref={draggable.handleRef}
          className="flex w-full flex-row items-center justify-center rounded-3xl border-border/30 border-t bg-background/40 p-1.5 shadow-lg transition-colors first:border-none"
        >
          <ChatBox />
          <MoreActionsButton />
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
