import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { XIcon, SquareDashedMousePointer } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';

interface ContextElementsChipsProps {
  domContextElements: {
    element: HTMLElement;
    pluginContext: {
      pluginName: string;
      context: any;
    }[];
    codeMetadata: {
      relativePath: string;
      startLine: number;
      endLine: number;
      content?: string;
    } | null;
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
          codeMetadata={contextElement.codeMetadata}
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
  codeMetadata: {
    relativePath: string;
    startLine: number;
    endLine: number;
    content?: string;
  } | null;
  onDelete: () => void;
  onHover: (element: HTMLElement) => void;
  onUnhover: () => void;
}

function ContextElementChip({
  element,
  pluginContext,
  codeMetadata,
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
    <Popover>
      <PopoverTrigger>
        <Button
          size="xs"
          variant="secondary"
          onMouseEnter={() => onHover(element)}
          onMouseLeave={() => onUnhover()}
          className="pr-0"
        >
          <SquareDashedMousePointer className="size-3 text-foreground/60" />
          <span className="max-w-24 truncate font-medium text-foreground/80">
            {chipLabel}
          </span>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="text-muted-foreground transition-colors hover:text-red-500"
          >
            <XIcon className="size-3" />
          </Button>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverTitle>Code Metadata</PopoverTitle>
        <div className="flex flex-col gap-2">
          <p className="text-foreground/70 text-sm">
            {codeMetadata?.relativePath}
          </p>
          <p className="text-foreground/70 text-sm">
            {codeMetadata?.startLine}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
