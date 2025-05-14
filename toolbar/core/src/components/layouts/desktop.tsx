// SPDX-License-Identifier: AGPL-3.0-only
// Desktop layout component for the toolbar
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

// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { ToolbarArea } from '@/components/toolbar/desktop-only/area';
import { useAppState } from '@/hooks/use-app-state';
import { cn } from '@/utils';
import { ExpandButton } from '../expand-button';
import { SelectorCanvas } from '../dom-context/selector-canvas';
import { usePlugins } from '@/hooks/use-plugins';
import {
  DraggableContext,
  type DraggableContextType,
  useDraggable,
} from '@/hooks/use-draggable';
import { useContext, useRef } from 'preact/hooks';
import { Button } from '@headlessui/react';
import { GripVertical } from 'lucide-react';
import { PluginPanels } from '../panels';

export function DesktopLayout() {
  const minimized = useAppState((state) => state.minimized);
  const plugins = usePlugins();
  const containerRef = useRef<HTMLDivElement>(null);
  return (
    <div className={cn('fixed inset-0 h-screen w-screen')}>
      <SelectorCanvas />
      {!minimized && (
        <>
          <ToolbarArea />
          <PluginPanels />
        </>
      )}
      {minimized && <ExpandButton />}
    </div>
  );
}

export function DraggablePluginArea({
  children,
}: { children: React.ReactNode }) {
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
        {Object.values(plugins.pluginPanels).map((Panel) => (
          <Panel.component key={Panel.options.title} />
        ))}
        {children}

        {/* <ToolbarDraggingGrip /> */}
        {/* If the app state is right, we also render the button that enables dragging the toolbar around */}
        <div
          ref={draggable.handleRef}
          className="flex w-fit flex-row items-center justify-center rounded-3xl border-border/30 border-t bg-background/40 p-1.5 shadow-lg transition-colors first:border-none"
        />
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
