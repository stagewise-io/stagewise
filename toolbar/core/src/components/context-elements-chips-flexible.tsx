import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { XIcon, SquareDashedMousePointer } from 'lucide-react';
import { useMemo } from 'react';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
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
    <>
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
    </>
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
    <div
      className={cn(
        buttonVariants({ variant: 'secondary', size: 'xs' }),
        'bg-background/80',
      )}
      onMouseEnter={() => onHover(element)}
      onMouseLeave={() => onUnhover()}
    >
      <SquareDashedMousePointer className="size-3 text-foreground/60" />
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
    </div>
  );
}
