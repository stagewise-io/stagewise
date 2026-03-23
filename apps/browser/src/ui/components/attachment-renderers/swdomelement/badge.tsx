import { SquareDashedMousePointer } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BadgeProps } from '../types';
import { OverlayScrollbar } from '@stagewise/stage-ui/components/overlay-scrollbar';
import { PreviewCardContent } from '@stagewise/stage-ui/components/preview-card';
import { cn } from '@stagewise/stage-ui/lib/utils';
import {
  truncateLabel,
  InlineBadge,
  InlineBadgeWrapper,
} from '@ui/screens/main/sidebar/chat/_components/rich-text/shared';
import { resolveAttachmentBlobUrl } from '@ui/components/attachment-renderers';
import { useOpenAgent } from '@ui/hooks/use-open-chat';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_BADGE_INNER_TEXT = 16;
const MAX_BADGE_WORDS = 2;

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Truncate inner text to at most two words / 16 characters for badge display.
 */
function truncateInnerText(text: string): string {
  const words = text.split(/\s+/).slice(0, MAX_BADGE_WORDS).join(' ');
  const truncated =
    words.length > MAX_BADGE_INNER_TEXT
      ? words.slice(0, MAX_BADGE_INNER_TEXT)
      : words;
  const needsEllipsis = truncated.length < text.length;
  return needsEllipsis ? `${truncated}…` : truncated;
}

// ── Screenshot thumbnail (same as element-attachment-view) ───────────────────

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

// ── Blob data type ───────────────────────────────────────────────────────────

interface SwDomBlobData {
  innerText?: string;
  screenshotBlobKey?: string;
  tagName?: string;
  xpath?: string;
  url?: string;
  attributes?: Record<string, string>;
  boundingClientRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  codeMetadata?: Array<{
    relation: string;
    relativePath: string;
    startLine?: number;
  }>;
}

// ── Preview card ─────────────────────────────────────────────────────────────

function SwDomPreviewContent({
  blobData,
  screenshotUrl,
}: {
  blobData: SwDomBlobData;
  screenshotUrl: string | undefined;
}) {
  const tagLabel = blobData.tagName ? `<${blobData.tagName}>` : null;
  const innerTextPreview = blobData.innerText?.trim() || null;
  const elementSize = blobData.boundingClientRect
    ? {
        width: Math.round(blobData.boundingClientRect.width),
        height: Math.round(blobData.boundingClientRect.height),
      }
    : null;

  return (
    <PreviewCardContent className="gap-2.5">
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

        {/* Node type */}
        {tagLabel && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Node type</p>
            <div className="w-full font-mono text-2xs text-muted-foreground leading-tight">
              {tagLabel}
            </div>
          </div>
        )}

        {/* Size */}
        {elementSize && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Size</p>
            <div className="w-full font-mono text-2xs text-muted-foreground leading-tight">
              {elementSize.width} × {elementSize.height}px
            </div>
          </div>
        )}

        {/* Inner text */}
        {innerTextPreview && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Text</p>
            <div className="line-clamp-3 w-full text-2xs text-muted-foreground leading-tight">
              {innerTextPreview}
            </div>
          </div>
        )}

        {/* XPath */}
        {blobData.xpath && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">XPath</p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {blobData.xpath}
            </div>
          </div>
        )}

        {/* Page URL */}
        {blobData.url && (
          <div className="flex flex-col items-stretch justify-start">
            <p className="font-medium text-foreground text-xs">Page</p>
            <div className="w-full break-all font-mono text-2xs text-muted-foreground leading-tight">
              {blobData.url}
            </div>
          </div>
        )}

        {/* Attributes */}
        {blobData.attributes &&
          displayedAttributes
            .filter(
              (attribute) =>
                blobData.attributes![attribute] !== null &&
                blobData.attributes![attribute] !== '' &&
                blobData.attributes![attribute] !== undefined,
            )
            .map((attribute) => (
              <div
                key={attribute}
                className="flex flex-col items-stretch justify-start"
              >
                <p className="font-medium text-foreground text-xs">
                  {attribute}
                </p>
                <div className="w-full select-text break-all font-mono text-2xs text-muted-foreground leading-tight">
                  {blobData.attributes![attribute]}
                </div>
              </div>
            ))}
      </OverlayScrollbar>
    </PreviewCardContent>
  );
}

// ── Badge ────────────────────────────────────────────────────────────────────

/**
 * Badge for `.swdomelement` attachments (selected DOM element snapshots).
 * Displays inner text as the label (falling back to node type).
 * Shows a rich preview card on hover matching the TipTap element badge.
 */
export function SwDomElementBadge(props: BadgeProps) {
  const [openAgent] = useOpenAgent();
  const [blobData, setBlobData] = useState<SwDomBlobData | null>(null);

  // Fetch the .swdomelement JSON to extract display data
  useEffect(() => {
    if (!props.blobUrl) return;
    let cancelled = false;

    fetch(props.blobUrl)
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
  }, [props.blobUrl]);

  // Label: prefer inner text, fall back to node type, then filename
  const label = useMemo(() => {
    const innerText = blobData?.innerText?.trim();
    if (innerText) {
      return truncateInnerText(innerText);
    }
    const tagName = blobData?.tagName;
    if (tagName) {
      return `<${tagName}>`;
    }
    return props.fileName;
  }, [blobData, props.fileName]);

  const displayLabel = useMemo(
    () => truncateLabel(label, props.attachmentId),
    [label, props.attachmentId],
  );

  // Resolve screenshot URL from blob key
  const screenshotUrl = useMemo(() => {
    if (!blobData?.screenshotBlobKey) return undefined;
    return (
      resolveAttachmentBlobUrl(
        `att/${blobData.screenshotBlobKey}`,
        openAgent,
      ) || undefined
    );
  }, [blobData?.screenshotBlobKey, openAgent]);

  // Icon: screenshot thumbnail or fallback selector icon
  const icon = screenshotUrl ? (
    <ScreenshotThumbnail src={screenshotUrl} className="size-3" />
  ) : (
    <SquareDashedMousePointer className="size-3 shrink-0" />
  );

  // Rich preview card (matching element-attachment-view)
  const previewContent = blobData ? (
    <SwDomPreviewContent blobData={blobData} screenshotUrl={screenshotUrl} />
  ) : undefined;

  // Fallback tooltip when blob data hasn't loaded yet
  const tooltipContent = !blobData ? (
    <span>Selected element: {props.fileName}</span>
  ) : undefined;

  return (
    <InlineBadgeWrapper
      viewOnly={props.viewOnly}
      previewContent={previewContent}
      tooltipContent={tooltipContent}
    >
      <InlineBadge
        icon={icon}
        label={displayLabel}
        selected={props.selected ?? false}
        isEditable={!props.viewOnly}
        onDelete={props.onDelete ?? (() => {})}
      />
    </InlineBadgeWrapper>
  );
}
