import { useContextChipHover } from '@/hooks/use-context-chip-hover';
import { getTruncatedFileUrl } from '@/utils';
import {
  XIcon,
  SquareDashedMousePointer,
  AtomIcon,
  ChevronLeft,
} from 'lucide-react';
import { useFileIDEHref } from '@/hooks/use-file-ide-href';
import { Button, buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@stagewise/stage-ui/components/popover';
import { cn } from '@stagewise/stage-ui/lib/utils';
import type { SelectedElement } from '@shared/karton-contracts/ui';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { usePostHog } from 'posthog-js/react';
import { useKartonState, useKartonProcedure } from '@/hooks/use-karton';
import { IdeLogo } from './ide-logo';
import { IconOpenExternalOutline18 } from 'nucleo-ui-outline-18';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ContextElementsChipsProps {
  selectedElements: {
    domElement?: HTMLElement;
    selectedElement: SelectedElement;
  }[];
  removeSelectedElement?: (element: HTMLElement) => void;
  removeSelectedElementById?: (id: string) => void;
}

export function ContextElementsChipsFlexible({
  selectedElements,
  removeSelectedElement,
  removeSelectedElementById,
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
              : removeSelectedElementById
                ? () =>
                    removeSelectedElementById?.(
                      selectedElement.selectedElement.stagewiseId,
                    )
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
  const posthog = usePostHog();
  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );
  const tabs = useKartonState((s) => s.browser.tabs);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const scrollToElement = useKartonProcedure((p) => p.browser.scrollToElement);
  const checkElementExists = useKartonProcedure(
    (p) => p.browser.checkElementExists,
  );
  const { getFileIDEHref } = useFileIDEHref();
  const [elementExistenceChecked, setElementExistenceChecked] = useState(false);
  const [elementExists, setElementExists] = useState<boolean | null>(null);

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
    let currentComponent = selectedElement.frameworkInfo?.react;
    while (currentComponent && flattenedComponents.length < 5) {
      flattenedComponents.push(currentComponent);
      currentComponent = currentComponent.parent;
    }
    return flattenedComponents;
  }, [selectedElement.frameworkInfo?.react]);

  // Check if the element exists in the DOM
  useEffect(() => {
    if (!selectedElement.tabId) {
      setElementExistenceChecked(true);
      setElementExists(false);
      return;
    }

    let cancelled = false;

    const checkExistence = async () => {
      try {
        const exists = await checkElementExists(
          selectedElement.tabId,
          selectedElement.backendNodeId,
          selectedElement.frameId,
        );
        if (!cancelled) {
          setElementExists(exists);
          setElementExistenceChecked(true);
        }
      } catch {
        if (!cancelled) {
          setElementExists(false);
          setElementExistenceChecked(true);
        }
      }
    };

    checkExistence();

    return () => {
      cancelled = true;
    };
  }, [
    selectedElement.tabId,
    selectedElement.backendNodeId,
    selectedElement.frameId,
    checkElementExists,
  ]);

  // Check if the tab exists and if the element exists in the DOM
  const isElementLocationValid = useMemo(() => {
    if (!selectedElement.tabId) return false;
    const tab = tabs[selectedElement.tabId];
    if (!tab) return false;

    // If we haven't checked yet, return false (button disabled until check completes)
    if (!elementExistenceChecked) return false;
    // Return the result of the element existence check
    return elementExists === true;
  }, [tabs, selectedElement.tabId, elementExistenceChecked, elementExists]);

  const handleScrollToElement = useCallback(async () => {
    if (!isElementLocationValid || !selectedElement.tabId) return;

    try {
      // Switch to the tab first
      await switchTab(selectedElement.tabId);
      // Wait a bit for the tab to be active, then scroll
      setTimeout(async () => {
        await scrollToElement(
          selectedElement.tabId,
          selectedElement.backendNodeId,
          selectedElement.frameId,
        );
      }, 100);
    } catch (error) {
      console.error('Failed to scroll to element:', error);
    }
  }, [
    isElementLocationValid,
    selectedElement.tabId,
    selectedElement.backendNodeId,
    selectedElement.frameId,
    switchTab,
    scrollToElement,
  ]);

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
      <PopoverContent className="pt-6 pr-2">
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-2 right-2 z-10"
              onClick={handleScrollToElement}
              disabled={!isElementLocationValid}
            >
              <IconOpenExternalOutline18 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isElementLocationValid
              ? 'Scroll to element in tab'
              : elementExistenceChecked
                ? 'Element no longer exists in the DOM'
                : 'Checking if element exists...'}
          </TooltipContent>
        </Tooltip>
        <div className="scrollbar-hover-only flex max-h-[35vh] max-w-72 flex-col gap-5 overflow-y-auto overflow-x-hidden pr-0.5 *:shrink-0">
          <div className="flex flex-col items-stretch justify-start gap-1.5">
            <p className="font-medium text-foreground text-sm">XPath</p>
            <div className="w-full break-all font-mono text-muted-foreground text-xs">
              {selectedElement.xpath}
            </div>
          </div>
          {selectedElement.frameLocation && (
            <div className="flex flex-col items-stretch justify-start gap-1.5">
              <p className="font-medium text-foreground text-sm">
                Frame Location
              </p>
              <div className="w-full break-all font-mono text-muted-foreground text-xs">
                {selectedElement.frameLocation}
              </div>
              {!selectedElement.isMainFrame && (
                <p className="text-muted-foreground text-xs italic">
                  Located within frame (iframe, etc.)
                </p>
              )}
            </div>
          )}
          {selectedElement.frameTitle && (
            <div className="flex flex-col items-stretch justify-start gap-1.5">
              <p className="font-medium text-foreground text-sm">Frame Title</p>
              <div className="w-full break-all text-muted-foreground text-xs">
                {selectedElement.frameTitle}
              </div>
            </div>
          )}
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
                    className="flex flex-row items-start justify-start gap-3"
                  >
                    <p className="max-w-1/3 shrink-0 basis-1/3 break-all text-foreground text-sm">
                      {attribute}
                    </p>
                    {isUrl(selectedElement.attributes[attribute]) ? (
                      <a
                        href={selectedElement.attributes[attribute]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-xs hover:text-primary"
                      >
                        {selectedElement.attributes[attribute]}{' '}
                        <IconOpenExternalOutline18 className="mb-0.5 ml-0.5 inline size-3.5" />
                      </a>
                    ) : (
                      <p className="mt-0.5 shrink basis-2/3 select-text font-mono text-muted-foreground text-xs">
                        {selectedElement.attributes[attribute]}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </div>

          {selectedElement.frameworkInfo?.react &&
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

          {selectedElement.codeMetadata &&
            selectedElement.codeMetadata.length > 0 && (
              <div className="flex flex-col items-stretch justify-start gap-1.5">
                <p className="w-full font-medium text-foreground text-sm">
                  Related source files
                </p>
                <div className="flex w-full flex-col items-stretch gap-2">
                  {selectedElement.codeMetadata.slice(0, 10).map((metadata) => (
                    <div
                      key={`${metadata.relativePath}|${metadata.startLine}`}
                      className="flex flex-col items-stretch"
                    >
                      <Tooltip>
                        <TooltipTrigger>
                          <a
                            href={getFileIDEHref(
                              metadata.relativePath,
                              metadata.startLine,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex shrink basis-4/5 gap-1 break-all text-foreground text-sm hover:text-primary"
                            onClick={() => {
                              posthog.capture(
                                'agent_file_opened_in_ide_via_element_context',
                                {
                                  file_path: metadata.relativePath,
                                  ide: openInIdeSelection,
                                  line_number: metadata.startLine,
                                },
                              );
                            }}
                          >
                            <IdeLogo
                              ide={openInIdeSelection}
                              className="size-3 shrink-0"
                            />
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

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
