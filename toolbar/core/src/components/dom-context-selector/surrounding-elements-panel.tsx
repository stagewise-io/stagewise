import type { HTMLAttributes } from 'react';
import { cn } from '@/utils';

export interface SurroundingElementsPanelProps
  extends HTMLAttributes<HTMLDivElement> {
  refElement: HTMLElement;
  surroundingElements: {
    parents: HTMLElement[];
    children: HTMLElement[];
  };
  onElementClick: (element: HTMLElement) => void;
}

const getElementId = (element: HTMLElement): string => {
  return element.id || '';
};

const getElementClassName = (element: HTMLElement): string => {
  if (typeof element.className === 'string') {
    return element.className;
  }
  if (element.className && typeof element.className === 'object' && 'baseVal' in element.className) {
    return (element.className as { baseVal: string }).baseVal || '';
  }
  return '';
};

const getFirstClassName = (element: HTMLElement): string => {
  const className = getElementClassName(element);
  if (!className) return '';
  const classes = className.trim().split(/\s+/);
  return classes[0] || '';
};

export function SurroundingElementsPanel({
  refElement,
  surroundingElements,
  onElementClick,
  ...props
}: SurroundingElementsPanelProps) {
  const hasElements =
    surroundingElements.parents.length > 0 ||
    surroundingElements.children.length > 0;

  if (!hasElements) return null;

  const referenceRect = refElement.getBoundingClientRect();
  const panelTop = referenceRect.top + referenceRect.height + 8;

  const parent = surroundingElements.parents[0];
  const child = surroundingElements.children[0];

  return (
    <div
      {...props}
      className={cn(
        'pointer-events-auto fixed z-20 flex flex-col gap-1 rounded-xl border border-zinc-950/20 bg-white/85 p-2 shadow-lg backdrop-blur-sm ring-1 ring-inset ring-white/30',
      )}
      style={{
        top: `${panelTop}px`,
        left: `${referenceRect.left}px`,
        minWidth: '220px',
      }}
    >
      {/* Parent Section */}
      {parent && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onElementClick(parent);
          }}
          className="flex items-center justify-between gap-2 rounded-lg bg-white/40 px-2.5 py-1.5 text-left text-zinc-950 text-xs transition-all duration-150 hover:bg-white/60 hover:shadow-sm active:scale-[98%]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-zinc-600">↑</span>
            <span className="font-mono font-medium truncate">
              {parent.tagName.toLowerCase()}
            </span>
            {getElementId(parent) && (
              <span className="text-zinc-600 truncate">#{getElementId(parent)}</span>
            )}
            {getFirstClassName(parent) && (
              <span className="text-zinc-600 truncate">
                .{getFirstClassName(parent)}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-zinc-500 whitespace-nowrap">Alt+↑</span>
        </button>
      )}

      {/* Child Section */}
      {child && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onElementClick(child);
          }}
          className="flex items-center justify-between gap-2 rounded-lg bg-white/40 px-2.5 py-1.5 text-left text-zinc-950 text-xs transition-all duration-150 hover:bg-white/60 hover:shadow-sm active:scale-[98%]"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-zinc-600">↓</span>
            <span className="font-mono font-medium truncate">
              {child.tagName.toLowerCase()}
            </span>
            {getElementId(child) && (
              <span className="text-zinc-600 truncate">#{getElementId(child)}</span>
            )}
            {getFirstClassName(child) && (
              <span className="text-zinc-600 truncate">
                .{getFirstClassName(child)}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-zinc-500 whitespace-nowrap">Alt+↓</span>
        </button>
      )}

      {/* Select shortcut hint */}
      <div className="border-zinc-500/15 border-t pt-1.5 mt-0.5 px-2 font-medium text-[10px] text-zinc-600">
        <span className="font-mono text-zinc-500">Alt+Enter</span> to select
      </div>
    </div>
  );
}
