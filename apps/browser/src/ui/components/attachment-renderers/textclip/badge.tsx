import {
  ClipboardPaste,
  CopyCheckIcon,
  CopyIcon,
  Maximize2,
} from 'lucide-react';
import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@ui/utils';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';
import { PreviewCardContent } from '@stagewise/stage-ui/components/preview-card';
import type { BadgeProps } from '../types';
import {
  InlineBadge,
  InlineBadgeWrapper,
} from '@ui/screens/main/agent-chat/chat/_components/rich-text/shared';

/** Maximum character count that allows inline expansion */
const EXPAND_THRESHOLD = 10_000;

/**
 * Preview content component showing text content with copy functionality.
 */
function TextPreviewContent({ content }: { content: string }) {
  const [hasCopied, setHasCopied] = useState(false);
  const copyResetTimeoutRef = useRef<number | null>(null);

  // Clear pending timeout on unmount to avoid setting state after unmount
  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current)
        clearTimeout(copyResetTimeoutRef.current);
    };
  }, []);

  const maxPreviewLength = 50000;
  const truncated = content.length > maxPreviewLength;
  const displayContent = truncated
    ? `${content.substring(0, maxPreviewLength)}...`
    : content;

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(content);
    setHasCopied(true);
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = setTimeout(
      () => setHasCopied(false),
      2000,
    ) as unknown as number;
  }, [content]);

  return (
    <PreviewCardContent className="gap-2.5">
      <span
        role="button"
        tabIndex={-1}
        onClick={copyToClipboard}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
          'absolute top-3 right-3 z-10 size-3 shrink-0 transition-opacity',
        )}
        title="Copy to clipboard"
      >
        {hasCopied ? (
          <CopyCheckIcon className="size-3" />
        ) : (
          <CopyIcon className="size-3" />
        )}
      </span>
      <div className="max-w-96">
        <div className="flex items-center justify-start gap-1">
          <h3 className="font-medium text-foreground text-xs">Pasted text</h3>
          <span className="font-mono text-2xs text-muted-foreground">
            {'  '}({content.length.toLocaleString()} characters)
          </span>
        </div>
        <p className="scrollbar-subtle mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-2xs text-muted-foreground leading-tight">
          {displayContent}
        </p>
      </div>
    </PreviewCardContent>
  );
}

/**
 * Badge renderer for `.textclip` attachments.
 *
 * Displays a clipboard-paste icon with a truncated preview of the text.
 * On hover shows a preview card with the full text and a copy button.
 * When editable and the clip is under 10K characters, shows an expand button
 * that inlines the text and removes the attachment.
 */
export function TextClipBadge(props: BadgeProps) {
  const { fileName, blobUrl, viewOnly, selected, onDelete } = props;
  const isEditable = !viewOnly;

  // Load text content from the blob URL
  const [content, setContent] = useState<string>('');
  useEffect(() => {
    if (!blobUrl) return;
    fetch(blobUrl)
      .then((r) => r.text())
      .then(setContent)
      .catch(() => setContent(''));
  }, [blobUrl]);

  // Display label: first ~15 characters of content
  const displayLabel = useMemo(() => {
    if (!content) {
      // Fall back to filename (strip extension)
      const name = fileName.replace(/\.textclip$/i, '');
      return name.length > 15 ? `${name.substring(0, 15).trim()}...` : name;
    }
    if (content.length <= 15) return content;
    return `${content.substring(0, 15).trim()}...`;
  }, [content, fileName]);

  const canExpand =
    isEditable && content.length > 0 && content.length <= EXPAND_THRESHOLD;

  const handleExpandClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Dispatch a custom event to notify the chat input to expand this textclip.
      // The chat-input handles replacing the attachment node with plain text and
      // cleaning up the file.
      window.dispatchEvent(
        new CustomEvent('textclip-expand', {
          detail: { attachmentId: props.attachmentId, content },
        }),
      );
    },
    [props.attachmentId, content],
  );

  // Preview content for the hover card
  const previewContent = content ? (
    <TextPreviewContent content={content} />
  ) : undefined;

  return (
    <InlineBadgeWrapper viewOnly={viewOnly} previewContent={previewContent}>
      <span className="group/badge relative inline-flex items-center align-middle">
        <InlineBadge
          icon={<ClipboardPaste className="size-3 text-foreground" />}
          label={displayLabel}
          selected={selected ?? false}
          isEditable={isEditable}
          onDelete={onDelete ?? (() => {})}
          className={canExpand ? 'pr-2' : undefined}
        />
        {/* Expand button - absolutely positioned inside badge, appears on hover */}
        {canExpand && (
          <Tooltip>
            <TooltipTrigger>
              <span
                role="button"
                tabIndex={-1}
                onClick={handleExpandClick}
                onMouseDown={(e) => e.preventDefault()}
                className={cn(
                  '-translate-y-1/2 absolute top-1/2 right-px flex size-4 cursor-pointer items-center justify-center rounded-r bg-surface-1 opacity-0 transition-opacity group-hover/badge:opacity-100',
                )}
                title="Use raw text"
              >
                <Maximize2 className="size-2.5 text-foreground-subtle" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Use raw text</TooltipContent>
          </Tooltip>
        )}
      </span>
    </InlineBadgeWrapper>
  );
}
