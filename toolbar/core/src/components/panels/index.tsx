import { DraggableProvider } from '@/hooks/use-draggable';
import { useRef } from 'preact/hooks';

import { Button } from '@headlessui/react';
import { GripVertical } from 'lucide-react';

import { useDraggable } from '@/hooks/use-draggable';
import { useContext } from 'preact/hooks';
import { DraggableContext } from '@/hooks/use-draggable';
import type { DraggableContextType } from '@/hooks/use-draggable';
import { usePlugins } from '@/hooks/use-plugins';
import type { PanelOptions } from '@/plugin';
import type { FunctionComponent } from 'preact';

export function PluginPanels() {
  const plugins = usePlugins();
  const containerRef = useRef<HTMLDivElement>(null);

  return Object.values(plugins.pluginPanels).map((Panel) => {
    const { title, width, height, position, resizable } = Panel.options;

    return (
      <div key={title} className="absolute size-full">
        <div className="absolute inset-4" ref={containerRef}>
          <DraggableProvider
            containerRef={containerRef}
            snapAreas={{
              topLeft: true,
              topCenter: true,
              topRight: true,
              centerLeft: true,
              center: true,
              centerRight: true,
              bottomLeft: true,
              bottomCenter: true,
              bottomRight: true,
            }}
          >
            <DraggablePluginArea
              component={Panel.component}
              options={Panel.options}
            />
          </DraggableProvider>
        </div>
      </div>
    );
  });
}

export function DraggablePluginArea({
  component,
  options,
}: {
  component: FunctionComponent;
  options: PanelOptions;
}) {
  const provider = useContext(DraggableContext) as DraggableContextType | null;
  const borderLocation = provider?.borderLocation;
  const isReady =
    !!borderLocation &&
    borderLocation.right - borderLocation.left > 0 &&
    borderLocation.bottom - borderLocation.top > 0;

  const draggable = useDraggable({
    startThreshold: 10,
    initialSnapArea: options.position,
  });

  if (!isReady) return null; // Wait until borderLocation is valid

  const plugins = usePlugins();

  return (
    <div
      ref={draggable.draggableRef}
      className="pointer-events-auto absolute h-96 w-96 p-0.5"
    >
      {/* This is the complete toolbar area where we can stack different stuff. The main toolbar content stands out. */}
      <div className="pointer-events-auto flex w-min max-w-[80vw] flex-col items-stretch justify-center rounded-3xl border border-border/30 border-solid bg-zinc-50/80 p-0 shadow-lg backdrop-blur-lg transition-colors">
        {Object.values(plugins.pluginPanels).map((Panel) => (
          <Panel.component key={Panel.options.title} />
        ))}
        {component}
        <ToolbarDraggingGrip />
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
