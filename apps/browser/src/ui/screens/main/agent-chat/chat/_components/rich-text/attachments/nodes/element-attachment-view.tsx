import posthog from 'posthog-js';
import { ChevronLeft, SquareDashedMousePointer } from 'lucide-react';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getTruncatedFileUrl } from '@ui/utils';
import { useFileIDEHref } from '@ui/hooks/use-file-ide-href';
import { IdePickerPopover } from '@ui/components/ide-picker-popover';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useMessageAttachments } from '@ui/hooks/use-message-elements';
import { useOpenAgent } from '@ui/hooks/use-open-chat';
import { resolveAttachmentBlobUrl } from '@ui/components/attachment-renderers';
import { Button } from '@stagewise/stage-ui/components/button';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { PreviewCardContent } from '@stagewise/stage-ui/components/preview-card';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { IdeLogo } from '@ui/components/ide-logo';
import { IconOpenExternalOutline18 } from 'nucleo-ui-outline-18';
import type { ElementAttachmentAttrs } from '../types';
import type { InlineNodeViewProps } from '../../shared/types';
import { truncateLabel, InlineBadge, InlineBadgeWrapper } from '../../shared';
import type { SelectedElement } from '@shared/selected-elements';

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

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// ─── Screenshot thumbnail ────────────────────────────────────────────────────

const MAX_THUMB_RETRIES = 8;
const THUMB_RETRY_DELAY_MS = 10;

function ScreenshotThumbnail({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleError = useCallback(() => {
    if (retry >= MAX_THUMB_RETRIES) return;
    timerRef.current = setTimeout(
      () => setRetry((r) => r + 1),
      THUMB_RETRY_DELAY_MS,
    );
  }, [retry]);

  const handleLoad = useCallback(() => setLoaded(true), []);

  const gaveUp = retry >= MAX_THUMB_RETRIES && !loaded;
  const cacheBustedSrc = retry > 0 ? `${src}?r=${retry}` : src;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded',
        className ?? 'size-3',
      )}
    >
      {!loaded && <SquareDashedMousePointer className="size-full" />}
      {!gaveUp && (
        <img
          src={cacheBustedSrc}
          alt="Element screenshot"
          className={`absolute inset-0 size-full object-cover ${
            loaded ? '' : 'invisible'
          }`}
          onError={handleError}
          onLoad={handleLoad}
        />
      )}
    </div>
  );
}

// ─── Preview card ────────────────────────────────────────────────────────────

/**
 * Preview card content showing detailed element information.
 * Element is passed from parent to avoid duplicate lookup.
 */
function ElementPreviewContent({
  element: selectedElement,
  screenshotUrl,
  attrs,
  effectiveInnerText,
  effectiveTagName,
  blobData,
}: {
  element: SelectedElement | undefined;
  screenshotUrl: string | undefined;
  attrs: ElementAttachmentAttrs;
  effectiveInnerText?: string;
  effectiveTagName?: string;
  blobData: SwDomBlobData | null;
}) {
  const openInIdeSelection = useKartonState(
    (s) => s.globalConfig.openFilesInIde,
  );
  const tabs = useKartonState((s) => s.browser.tabs);
  const switchTab = useKartonProcedure((p) => p.browser.switchTab);
  const scrollToElement = useKartonProcedure((p) => p.browser.scrollToElement);
  const checkElementExists = useKartonProcedure(
    (p) => p.browser.checkElementExists,
  );
  const { getFileIDEHref, needsIdePicker, pickIdeAndOpen } = useFileIDEHref();
  const [elementExistenceChecked, setElementExistenceChecked] = useState(false);
  const [elementExists, setElementExists] = useState<boolean | null>(null);

  const flattenedReactComponentTree = useMemo(() => {
    // Return the flattened component tree as a list of components. Limit to first 3 components.
    const flattenedComponents = [];
    let currentComponent = selectedElement?.frameworkInfo?.react;
    while (currentComponent && flattenedComponents.length < 5) {
      flattenedComponents.push(currentComponent);
      currentComponent = currentComponent.parent;
    }
    return flattenedComponents;
  }, [selectedElement?.frameworkInfo?.react]);

  // Check if the element exists in the DOM
  useEffect(() => {
    if (!selectedElement?.tabId) {
      setElementExistenceChecked(true);
      setElementExists(false);
      return;
    }

    let cancelled = false;

    const checkExistence = async () => {
      try {
        const noDataPresent =
          !selectedElement?.tabId ||
          !selectedElement?.backendNodeId ||
          !selectedElement?.frameId;
        const exists = noDataPresent
          ? false
          : await checkElementExists(
              selectedElement.tabId!,
              selectedElement.backendNodeId!,
              selectedElement.frameId!,
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
    selectedElement?.tabId,
    selectedElement?.backendNodeId,
    selectedElement?.frameId,
    checkElementExists,
  ]);

  // Check if the tab exists and if the element exists in the DOM
  const isElementLocationValid = useMemo(() => {
    if (!selectedElement?.tabId) return false;
    const tab = tabs[selectedElement.tabId];
    if (!tab) return false;

    // If we haven't checked yet, return false (button disabled until check completes)
    if (!elementExistenceChecked) return false;
    // Return the result of the element existence check
    return elementExists === true;
  }, [tabs, selectedElement?.tabId, elementExistenceChecked, elementExists]);

  const handleScrollToElement = useCallback(async () => {
    if (!isElementLocationValid || !selectedElement?.tabId) return;

    try {
      // Switch to the tab first
      await switchTab(selectedElement?.tabId);
      // Wait a bit for the tab to be active, then scroll
      const noDataPresent =
        !selectedElement?.tabId ||
        !selectedElement?.backendNodeId ||
        !selectedElement?.frameId;
      setTimeout(async () => {
        if (!noDataPresent)
          await scrollToElement(
            selectedElement.tabId!,
            selectedElement.backendNodeId!,
            selectedElement.frameId!,
          );
      }, 100);
    } catch (error) {
      console.error('Failed to scroll to element:', error);
      posthog.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { source: 'renderer', operation: 'scrollToElement' },
      );
    }
  }, [
    isElementLocationValid,
    selectedElement?.tabId,
    selectedElement?.backendNodeId,
    selectedElement?.frameId,
    switchTab,
    scrollToElement,
  ]);

  // Build a minimal info summary from attrs when no element context is available
  const tagLabel = selectedElement
    ? `<${(selectedElement.nodeType || selectedElement.tagName || '').toLowerCase()}>`
    : (effectiveTagName ?? attrs.tagName)
      ? `<${effectiveTagName ?? attrs.tagName}>`
      : null;

  const innerTextPreview =
    selectedElement?.innerText?.trim() || effectiveInnerText?.trim() || null;

  // Element size from context or bounding rect, falling back to blob data
  const boundingRect =
    selectedElement?.boundingClientRect ?? blobData?.boundingClientRect;
  const elementSize = boundingRect
    ? {
        width: Math.round(boundingRect.width),
        height: Math.round(boundingRect.height),
      }
    : null;

  // XPath from context or blob
  const xpath = selectedElement?.xpath ?? blobData?.xpath;

  // URL from blob (page URL where element was captured)
  const pageUrl = blobData?.url;

  // Attributes from context or blob
  const effectiveAttributes: Record<string, string> | undefined =
    selectedElement?.attributes ?? blobData?.attributes;

  // Code metadata from context or blob
  const effectiveCodeMetadata =
    selectedElement?.codeMetadata ?? blobData?.codeMetadata;

  if (!selectedElement && !screenshotUrl && !innerTextPreview && !blobData)
    return null;

  return (
    <PreviewCardContent className="gap-2.5">
      {selectedElement && (
        <Tooltip>
          <TooltipTrigger>
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-3 right-3 z-10 size-3"
              onClick={(e) => {
                e.stopPropagation();
                handleScrollToElement();
              }}
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
      )}
      <OverlayScrollbar
        className="max-h-[35vh] max-w-72"
        contentClassName="flex flex-col gap-2.5 *:shrink-0"
      >
        {/* Screenshot */}
        {screenshotUrl && (
          <img
            src={screenshotUrl}
            alt="Element screenshot"
            className="max-h-40 w-full rounded object-contain"
          />
        )}

        {/* Node type + size + inner text summary */}
        {tagLabel && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Node type</p>
            <div className="w-full font-mono text-2xs text-muted-foreground leading-tight">
              {tagLabel}
            </div>
          </div>
        )}
        {elementSize && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Size</p>
            <div className="w-full font-mono text-2xs text-muted-foreground leading-tight">
              {elementSize.width} × {elementSize.height}px
            </div>
          </div>
        )}
        {innerTextPreview && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Text</p>
            <div className="line-clamp-3 w-full text-2xs text-muted-foreground leading-tight">
              {innerTextPreview}
            </div>
          </div>
        )}

        {xpath && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">XPath</p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {xpath}
            </div>
          </div>
        )}
        {pageUrl && !selectedElement && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Page</p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {pageUrl}
            </div>
          </div>
        )}
        {selectedElement?.frameLocation && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">
              Frame Location
            </p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {selectedElement.frameLocation}
            </div>
            {!selectedElement.isMainFrame && (
              <p className="text-2xs text-muted-foreground italic leading-tight">
                Located within frame (iframe, etc.)
              </p>
            )}
          </div>
        )}
        {selectedElement?.frameTitle && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Frame Title</p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {selectedElement.frameTitle}
            </div>
          </div>
        )}
        {effectiveAttributes &&
          displayedAttributes
            .filter(
              (attribute) =>
                effectiveAttributes[attribute] !== null &&
                effectiveAttributes[attribute] !== '' &&
                effectiveAttributes[attribute] !== undefined,
            )
            .map((attribute) => (
              <div
                key={attribute}
                className="flex flex-col items-stretch justify-start"
              >
                <p className="font-medium text-foreground text-xs">
                  {attribute}
                </p>
                {isUrl(effectiveAttributes[attribute]!) ? (
                  <a
                    href={effectiveAttributes[attribute]!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full break-all font-mono text-2xs text-primary-foreground leading-tight hover:text-hover-derived"
                  >
                    {effectiveAttributes[attribute]!}{' '}
                    <IconOpenExternalOutline18 className="mb-0.5 ml-0.5 inline size-3.5" />
                  </a>
                ) : (
                  <div className="w-full select-text break-all font-mono text-2xs text-muted-foreground leading-tight">
                    {effectiveAttributes[attribute]}
                  </div>
                )}
              </div>
            ))}

        {selectedElement?.frameworkInfo?.react &&
          flattenedReactComponentTree.length > 0 && (
            <div className="flex flex-col items-stretch justify-start gap-0.5 leading-none">
              <p className="font-medium text-foreground text-xs">
                React Component Tree
              </p>
              <div>
                {flattenedReactComponentTree.map((component, index) => {
                  return (
                    <Fragment key={`${component.componentName}-${index}`}>
                      <span
                        className={cn(
                          'font-mono text-2xs text-foreground leading-tight',
                          index === 0 &&
                            'font-semibold text-primary-foreground',
                          index > 1 && 'text-muted-foreground',
                        )}
                      >
                        {component.componentName}
                        {component.isRSC ? '(RSC)' : ''}
                      </span>
                      {index < flattenedReactComponentTree.length - 1 && (
                        <ChevronLeft className="inline-block size-3 text-muted-foreground" />
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

        {effectiveCodeMetadata && effectiveCodeMetadata.length > 0 && (
          <div className="flex flex-col items-stretch justify-start gap-0.5">
            <p className="w-full font-medium text-foreground text-xs">
              Related source files
            </p>
            <div className="flex w-full flex-col items-stretch gap-2">
              {effectiveCodeMetadata.slice(0, 10).map((metadata) => {
                const anchor = (
                  <a
                    href={
                      needsIdePicker
                        ? '#'
                        : getFileIDEHref(
                            metadata.relativePath,
                            metadata.startLine,
                          )
                    }
                    target={needsIdePicker ? undefined : '_blank'}
                    rel="noopener noreferrer"
                    onClick={
                      needsIdePicker ? (e) => e.preventDefault() : undefined
                    }
                    className="flex shrink basis-4/5 gap-1 break-all text-foreground text-sm hover:text-primary"
                  >
                    <IdeLogo
                      ide={openInIdeSelection}
                      className="size-3 shrink-0"
                    />
                    {getTruncatedFileUrl(metadata.relativePath)}
                  </a>
                );

                return (
                  <div
                    key={`${metadata.relativePath}|${metadata.startLine}`}
                    className="flex flex-col items-stretch"
                  >
                    {needsIdePicker ? (
                      <IdePickerPopover
                        onSelect={(ide) =>
                          pickIdeAndOpen(
                            ide,
                            metadata.relativePath,
                            metadata.startLine,
                          )
                        }
                      >
                        {anchor}
                      </IdePickerPopover>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger>{anchor}</TooltipTrigger>
                        <TooltipContent>{metadata.relation}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </OverlayScrollbar>
    </PreviewCardContent>
  );
}

const MAX_BADGE_INNER_TEXT = 16;
const MAX_BADGE_WORDS = 2;

/**
 * Custom NodeView for element attachments (selected DOM elements).
 * Displays the element with a screenshot thumbnail (or fallback icon)
 * and shows the first 28 characters of inner text (or tag name).
 * Hover shows a preview card with screenshot + element details.
 */
/**
 * Hydrated data from the `.swdomelement` JSON blob.
 * Used when the view is reconstructed from markdown and attrs are missing.
 */
interface SwDomBlobData {
  innerText?: string;
  screenshotBlobKey?: string;
  tagName?: string;
  xpath?: string;
  url?: string;
  attributes?: Record<string, string>;
  boundingClientRect?: { x: number; y: number; width: number; height: number };
  codeMetadata?: Array<{
    relation: string;
    relativePath: string;
    startLine?: number;
  }>;
}

export function ElementAttachmentView(props: InlineNodeViewProps) {
  const attrs = props.node.attrs as ElementAttachmentAttrs;
  const isEditable = !('viewOnly' in props);
  const [openAgent] = useOpenAgent();

  // Look up element data from context
  const { elements } = useMessageAttachments();
  const element = useMemo(
    () => elements.find((el) => el.stagewiseId === attrs.id),
    [elements, attrs.id],
  );

  // When reconstructed from markdown, attrs like innerText/screenshotBlobKey
  // are missing. Fetch the .swdomelement JSON blob to hydrate them.
  const [blobData, setBlobData] = useState<SwDomBlobData | null>(null);
  useEffect(() => {
    // Only fetch when we have a blobPath but are missing key display attrs
    const blobPath = attrs.blobPath as string | undefined;
    if (!blobPath || !openAgent) return;
    if (attrs.innerText || attrs.screenshotBlobKey) return;

    let cancelled = false;
    const url = resolveAttachmentBlobUrl(blobPath, openAgent);
    if (!url) return;

    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json) return;
        setBlobData({
          innerText: json.inner_text,
          screenshotBlobKey: json.screenshot,
          tagName: json.tagName ?? json.nodeType,
          xpath: json.xpath,
          url: json.url,
          attributes: json.attributes,
          boundingClientRect: json.boundingClientRect,
          codeMetadata: json.codeMetadata,
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [attrs.blobPath, attrs.innerText, attrs.screenshotBlobKey, openAgent]);

  // Merge attrs with blob data (attrs take precedence)
  const effectiveInnerText = attrs.innerText ?? blobData?.innerText;
  const effectiveScreenshotBlobKey =
    attrs.screenshotBlobKey ?? blobData?.screenshotBlobKey;
  const effectiveTagName = attrs.tagName ?? blobData?.tagName;

  // Resolve screenshot URL from blob key
  const screenshotUrl = useMemo(() => {
    if (!effectiveScreenshotBlobKey) return undefined;
    return (
      resolveAttachmentBlobUrl(
        `att/${effectiveScreenshotBlobKey}`,
        openAgent,
      ) || undefined
    );
  }, [effectiveScreenshotBlobKey, openAgent]);

  // Label: prefer inner text (first 28 chars), fall back to tag name
  const label = useMemo(() => {
    // Try inner text from context first, then from attrs/blob
    const innerText =
      element?.innerText?.trim() || effectiveInnerText?.trim() || '';
    if (innerText.length > 0) {
      // Limit to two words and/or 16 characters, whichever comes first
      const words = innerText.split(/\s+/).slice(0, MAX_BADGE_WORDS).join(' ');
      const truncated =
        words.length > MAX_BADGE_INNER_TEXT
          ? words.slice(0, MAX_BADGE_INNER_TEXT)
          : words;
      const needsEllipsis = truncated.length < innerText.length;
      return needsEllipsis ? `${truncated}…` : truncated;
    }
    // Fall back to tag name
    if (element) {
      const tagName = (element.nodeType || element.tagName || '').toLowerCase();
      const domId = element.attributes?.id ? `#${element.attributes.id}` : '';
      return `${tagName}${domId}` || attrs.label;
    }
    return effectiveTagName ? `<${effectiveTagName}>` : attrs.label;
  }, [element, effectiveInnerText, effectiveTagName, attrs.label]);

  const displayLabel = useMemo(
    () => truncateLabel(label, attrs.id),
    [label, attrs.id],
  );

  // Icon: screenshot thumbnail or fallback selector icon
  const icon = screenshotUrl ? (
    <ScreenshotThumbnail src={screenshotUrl} className="size-3" />
  ) : (
    <SquareDashedMousePointer className="size-3 shrink-0" />
  );

  const previewContent = (
    <ElementPreviewContent
      element={element}
      screenshotUrl={screenshotUrl}
      attrs={attrs}
      effectiveInnerText={effectiveInnerText}
      effectiveTagName={effectiveTagName}
      blobData={blobData}
    />
  );

  return (
    <InlineBadgeWrapper viewOnly={!isEditable} previewContent={previewContent}>
      <InlineBadge
        icon={icon}
        label={displayLabel}
        selected={props.selected}
        isEditable={isEditable}
        onDelete={() =>
          'deleteNode' in props ? props.deleteNode() : undefined
        }
      />
    </InlineBadgeWrapper>
  );
}
