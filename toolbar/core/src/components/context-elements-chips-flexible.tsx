import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import {
  XIcon,
  SquareDashedMousePointer,
  AtomIcon,
  ChevronLeft,
} from 'lucide-react';
import { useMemo } from 'react';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { getTruncatedFileUrl } from '@/utils';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { SelectedElement } from '@stagewise/karton-contract';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';

interface ContextElementsChipsProps {
  selectedElements: {
    domElement?: HTMLElement;
    selectedElement: SelectedElement;
  }[];
  removeSelectedElement?: (element: HTMLElement) => void;
}

export function ContextElementsChipsFlexible({
  selectedElements,
  removeSelectedElement,
}: ContextElementsChipsProps) {
  const { setHoveredElement } = useContextChipHover();

  if (selectedElements.length === 0) {
    return null;
  }

  return (
    <>
      {selectedElements.map((selectedElement) => (
        <ContextElementChip
          key={`${selectedElement.selectedElement.stagewiseId}`}
          element={selectedElement.domElement}
          selectedElement={selectedElement.selectedElement}
          onDelete={
            removeSelectedElement && selectedElement.domElement
              ? () => removeSelectedElement?.(selectedElement.domElement!)
              : undefined
          }
          onHover={setHoveredElement}
          onUnhover={() => setHoveredElement(null)}
        />
      ))}
    </>
  );
}

interface ContextElementChipProps {
  element?: HTMLElement;
  selectedElement: SelectedElement;
  onDelete?: () => void;
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
  selectedElement,
  onDelete,
  onHover,
  onUnhover,
}: ContextElementChipProps) {
  const { getFileIDEHref } = useFileIDEHref();
  const chipLabel = useMemo(() => {
    // We first try to get the component name from the framework info and then fallback to the element tag name
    const reactComponentName =
      selectedElement.frameworkInfo?.react?.componentName;

    if (reactComponentName) {
      return reactComponentName;
    }

    const tagName = selectedElement.nodeType.toLowerCase();
    const id = selectedElement.attributes.id
      ? `#${selectedElement.attributes.id}`
      : '';
    return `${tagName}${id}`;
  }, [selectedElement]);

  const flattenedReactComponentTree = useMemo(() => {
    // Return the flattened component tree as a list of components. Limit to first 3 components.
    const flattenedComponents = [];
    let currentComponent = selectedElement.frameworkInfo.react;
    while (currentComponent && flattenedComponents.length < 5) {
      flattenedComponents.push(currentComponent);
      currentComponent = currentComponent.parent;
    }
    return flattenedComponents;
  }, [selectedElement.frameworkInfo.react]);

  return (
    <Popover>
      <PopoverTrigger>
        <Button
          size="xs"
          variant="secondary"
          onMouseEnter={() => element && onHover(element)}
          onMouseLeave={() => onUnhover()}
          className="bg-muted/10 text-foreground"
        >
          <SquareDashedMousePointer className="size-3" />
          <span className="max-w-24 truncate font-medium">{chipLabel}</span>
          {onDelete && (
            <div
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
                '-mr-2 text-muted-foreground transition-colors hover:text-red-500',
              )}
            >
              <XIcon className="size-3" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="pr-2">
        <div className="scrollbar-thin scrollbar-thumb-transparent hover:scrollbar-thumb-foreground/30 flex max-h-[35vh] max-w-72 flex-col gap-5 overflow-y-auto overflow-x-hidden pr-0.5 *:shrink-0">
          <div className="flex flex-col items-stretch justify-start gap-1.5">
            <p className="font-medium text-foreground text-sm">XPath</p>
            <div className="w-full break-all font-mono text-muted-foreground text-xs">
              {selectedElement.xpath}
            </div>
          </div>
          <div className="flex flex-col items-stretch justify-start gap-1.5">
            <p className="font-medium text-foreground text-sm">Attributes</p>
            <div className="flex w-full flex-col items-stretch gap-0.5">
              {displayedAttributes
                .filter(
                  (attribute) =>
                    selectedElement.attributes[attribute] !== null &&
                    selectedElement.attributes[attribute] !== '' &&
                    selectedElement.attributes[attribute] !== undefined,
                )
                .map((attribute) => (
                  <div
                    key={attribute}
                    className="flex flex-row items-start justify-start gap-1"
                  >
                    <p className="max-w-1/3 shrink-0 basis-1/4 break-all text-foreground text-sm">
                      {attribute}
                    </p>
                    <p className="shrink basis-3/4 font-mono text-muted-foreground text-xs">
                      {selectedElement.attributes[attribute]}
                    </p>
                  </div>
                ))}
            </div>
          </div>

          {selectedElement.frameworkInfo.react &&
            flattenedReactComponentTree.length > 0 && (
              <div className="flex flex-col items-stretch justify-start gap-1.5">
                <p className="font-medium text-foreground text-sm">
                  <AtomIcon className="mb-px inline size-4" /> React Component
                  Tree
                </p>
                <div>
                  {flattenedReactComponentTree.map((component, index) => {
                    return (
                      <>
                        <span
                          className={cn(
                            'font-mono text-foreground text-xs',
                            index === 0 && 'font-semibold text-primary',
                            index > 1 && 'text-muted-foreground',
                          )}
                        >
                          {component.componentName}
                        </span>
                        {index < flattenedReactComponentTree.length - 1 && (
                          <ChevronLeft className="inline-block size-3.5 text-muted-foreground" />
                        )}
                      </>
                    );
                  })}
                </div>
              </div>
            )}

          {selectedElement.codeMetadata.length > 0 && (
            <div className="flex flex-col items-stretch justify-start gap-1.5">
              <p className="w-full font-medium text-foreground text-sm">
                Related source files
              </p>
              <div className="flex w-full flex-col items-stretch gap-2">
                {selectedElement.codeMetadata.map((metadata) => (
                  <div
                    key={`${metadata.relativePath}|${metadata.startLine}`}
                    className="flex flex-col items-stretch"
                  >
                    <Tooltip>
                      <TooltipTrigger>
                        <a
                          href={getFileIDEHref(metadata.relativePath)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink basis-4/5 break-all text-foreground text-sm hover:text-primary"
                        >
                          {getTruncatedFileUrl(metadata.relativePath)}
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>{metadata.relation}</TooltipContent>
                    </Tooltip>
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
