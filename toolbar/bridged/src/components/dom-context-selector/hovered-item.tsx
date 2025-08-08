import { useWindowSize } from '@/hooks/use-window-size';
import { useCyclicUpdate } from '@/hooks/use-cyclic-update';
import { useCallback, useMemo, useRef } from 'react';
import type { HTMLAttributes } from 'react';
import { usePlugins } from '@/hooks/use-plugins';
import { cn } from '@/utils';

export interface HoveredItemProps extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
}

export function HoveredItem({ refElement, ...props }: HoveredItemProps) {
  const boxRef = useRef<HTMLDivElement>(null);

  const windowSize = useWindowSize();

  const { plugins } = usePlugins();

  const hoveredElementPluginContext = useMemo(() => {
    if (!refElement) return [];
    const pluginsWithContextGetters = plugins.filter(
      (plugin) => plugin.onContextElementSelect,
    );

    return pluginsWithContextGetters.map((plugin) => ({
      pluginName: plugin.pluginName,
      context: plugin.onContextElementSelect?.(refElement),
    }));
  }, [refElement]);

  const updateBoxPosition = useCallback(() => {
    if (boxRef.current && refElement) {
      const referenceRect = refElement.getBoundingClientRect();

      boxRef.current.style.top = `${referenceRect.top - 2}px`;
      boxRef.current.style.left = `${referenceRect.left - 2}px`;
      boxRef.current.style.width = `${referenceRect.width + 4}px`;
      boxRef.current.style.height = `${referenceRect.height + 4}px`;
      boxRef.current.style.display = undefined;
    } else {
      boxRef.current.style.height = '0px';
      boxRef.current.style.width = '0px';
      boxRef.current.style.top = `${windowSize.height / 2}px`;
      boxRef.current.style.left = `${windowSize.width / 2}px`;
      boxRef.current.style.display = 'none';
    }
  }, [refElement, windowSize.height, windowSize.width]);

  useCyclicUpdate(updateBoxPosition, 30);

  return (
    <div
      {...props}
      className={cn(
        'fixed z-10 flex items-center justify-center rounded-sm border-2 border-blue-600/70 border-dotted bg-blue-600/5 text-white transition-all duration-100',
      )}
      ref={boxRef}
    >
      <div className="absolute top-0.5 left-0.5 flex w-full flex-row items-start justify-start gap-1">
        <div className="flex flex-row items-center justify-center gap-0.5 overflow-hidden rounded-md bg-zinc-700/80 px-1 py-0 font-medium text-white text-xs">
          <span className="truncate">{refElement.tagName.toLowerCase()}</span>
        </div>
        {hoveredElementPluginContext
          .filter((plugin) => plugin.context.annotation)
          .map((plugin) => (
            <div
              key={plugin.pluginName}
              className="flex flex-row items-center justify-center gap-0.5 overflow-hidden rounded-md bg-zinc-700/80 px-1 py-0 font-medium text-white text-xs"
            >
              <span className="size-3 shrink-0 stroke-white text-white *:size-full">
                {
                  plugins.find((p) => p.pluginName === plugin.pluginName)
                    ?.iconSvg
                }
              </span>
              <span className="truncate">{plugin.context.annotation}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
