import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { XIcon, SquareDashedMousePointer } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { getIDEFileUrl, getXPathForElement } from '@/utils';
import { useKartonState } from '@/hooks/use-karton';

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
  }[];
  onDelete: () => void;
  onHover: (element: HTMLElement) => void;
  onUnhover: () => void;
}

const displayedAttributes = [
  'id',
  'class',
  'name',
  'type',
  'href',
  'src',
  'alt',
  'placeholder',
  'title',
  'aria-label',
  'aria-role',
  'aria-description',
  'aria-hidden',
  'aria-disabled',
  'aria-expanded',
  'aria-selected',
];

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

  const workspacePath = useKartonState((s) => s.workspace?.path);

  const openInIdeChoice = useKartonState((s) => s.globalConfig.openFilesInIde);

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
        <div className="flex flex-col gap-3">
          <div className="flex flex-col items-stretch justify-start gap-1">
            <p className="font-medium text-foreground text-sm">XPath</p>
            <div className="glass-inset w-full break-all rounded-lg px-1.5 py-1 font-mono text-foreground/70 text-sm">
              {getXPathForElement(element, true)}
            </div>
          </div>
          <div className="flex flex-col items-stretch justify-start gap-1">
            <p className="font-medium text-foreground text-sm">Attributes</p>
            <div className="flex w-full flex-col items-stretch gap-0.5">
              {displayedAttributes
                .filter(
                  (attribute) =>
                    element.getAttribute(attribute) !== null &&
                    element.getAttribute(attribute) !== '' &&
                    element.getAttribute(attribute) !== undefined,
                )
                .map((attribute) => (
                  <div
                    key={attribute}
                    className="flex flex-row items-start justify-start gap-1"
                  >
                    <p className="basis-1/3 font-medium text-muted-foreground text-sm">
                      {attribute}
                    </p>
                    <p className="basis-2/3 font-mono text-muted-foreground text-xs">
                      {element.getAttribute(attribute)}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {codeMetadata.length > 0 && (
            <div className="flex flex-col items-stretch justify-start gap-1">
              <div className="flex flex-row items-start justify-between gap-3">
                <p className="basis-3/4 font-medium text-foreground text-sm">
                  Related source files
                </p>
                <p className="basis-1/4 text-end font-medium text-muted-foreground text-sm">
                  Lines
                </p>
              </div>
              <div className="flex w-full flex-col items-stretch gap-0.5">
                {codeMetadata.map((metadata) => (
                  <div
                    key={
                      metadata.relativePath +
                      '|' +
                      metadata.startLine +
                      '|' +
                      metadata.endLine
                    }
                    className="flex flex-row items-start justify-start gap-1"
                  >
                    <a
                      href={getIDEFileUrl(
                        workspacePath!.replace('\\', '/') +
                          '/' +
                          metadata.relativePath.replace('\\', '/'),
                        openInIdeChoice,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="basis-3/4 font-medium text-muted-foreground text-sm"
                    >
                      {metadata.relativePath}
                    </a>
                    <p className="basis-1/4 text-end font-mono text-muted-foreground text-sm">
                      {metadata.startLine} - {metadata.endLine}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
