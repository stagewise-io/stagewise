import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { XIcon } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/utils';

interface ContextElementsChipsProps {
  domContextElements: {
    element: HTMLElement;
    pluginContext: {
      pluginName: string;
      context: any;
    }[];
  }[];
  removeChatDomContext: (element: HTMLElement) => void;
}

export function ContextElementsChipsFlexible({
  domContextElements,
  removeChatDomContext,
}: ContextElementsChipsProps) {
  const { setHoveredElement } = useContextChipHover();

  if (domContextElements.length === 0) {
    return null;
  }

  return (
    <div className="">
      <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
        {domContextElements.map((contextElement, index) => (
          <ContextElementChip
            key={`${contextElement.element.tagName}-${index}`}
            element={contextElement.element}
            pluginContext={contextElement.pluginContext}
            onDelete={() => removeChatDomContext(contextElement.element)}
            onHover={setHoveredElement}
            onUnhover={() => setHoveredElement(null)}
          />
        ))}
      </div>
    </div>
  );
}

interface ContextElementChipProps {
  element: HTMLElement;
  pluginContext: {
    pluginName: string;
    context: any;
  }[];
  onDelete: () => void;
  onHover: (element: HTMLElement) => void;
  onUnhover: () => void;
}

function ContextElementChip({
  element,
  pluginContext,
  onDelete,
  onHover,
  onUnhover,
}: ContextElementChipProps) {
  const chipLabel = useMemo(() => {
    // First try to get label from plugin context
    const firstAnnotation = pluginContext.find(
      (plugin) => plugin.context?.annotation,
    )?.context?.annotation;

    if (firstAnnotation) {
      return firstAnnotation;
    }

    // Fallback to element tag name
    const tagName = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    return `${tagName}${id}`;
  }, [element, pluginContext]);

  return (
    <button
      type="button"
      tabIndex={-1}
      className={cn(
        'flex min-w-fit shrink-0 items-center gap-1 rounded-lg border border-border/20 bg-white/30 px-2 py-1 text-xs shadow-sm backdrop-blur-lg transition-all hover:border-border/40 hover:bg-white/80',
      )}
      onMouseEnter={() => onHover(element)}
      onMouseLeave={() => onUnhover()}
    >
      <span className="max-w-24 truncate font-medium text-foreground/80">
        {chipLabel}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-muted-foreground transition-colors hover:text-red-500"
      >
        <XIcon className="size-3" />
      </button>
    </button>
  );
}
