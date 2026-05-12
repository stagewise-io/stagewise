import { NodeViewWrapper } from '@tiptap/react';
import { PreviewCard as PreviewCardBase } from '@base-ui/react/preview-card';
import { XIcon } from 'lucide-react';
import { useCallback, forwardRef } from 'react';
import { cn } from '@ui/utils';
import { PreviewCard } from '@stagewise/stage-ui/components/preview-card';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@stagewise/stage-ui/components/tooltip';

const MAX_BADGE_LABEL = 24;

/**
 * Truncates a label for inline badge display, preserving file extensions.
 *
 * For path-style labels (containing `/`) only the last segment (filename) is
 * kept and, if still too long, mid-truncated so the extension stays visible.
 * For plain labels the same mid-truncation applies.
 *
 * The result is guaranteed to be short enough that CSS `truncate` on
 * `InlineBadge` never clips the end of the filename.
 *
 * @param label - The label to truncate
 * @param fallbackId - Fallback value if label is empty
 * @returns The truncated label
 */
export function truncateLabel(
  label: string | undefined,
  fallbackId: string,
): string {
  if (!label) return fallbackId;

  // For path-style labels, keep only the filename.
  const slashIdx = label.lastIndexOf('/');
  const display = slashIdx >= 0 ? label.slice(slashIdx + 1) : label;

  if (!display) return fallbackId;
  if (display.length <= MAX_BADGE_LABEL) return display;

  // Mid-truncate, preserving the extension.
  const dotIdx = display.lastIndexOf('.');
  const base = dotIdx > 0 ? display.substring(0, dotIdx) : display;
  const ext = dotIdx > 0 ? display.substring(dotIdx) : '';
  const keep = MAX_BADGE_LABEL - ext.length - 1; // 1 char for …

  if (keep <= 0) return `…${ext}`;
  return `${base.substring(0, keep)}…${ext}`;
}

export interface BadgeContainerProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Whether the node is currently selected in the editor */
  selected?: boolean;
  /** Whether the badge is rendered inside an editable editor (edit mode) */
  editMode?: boolean;
  /** Children to render inside the badge */
  children: React.ReactNode;
}

/**
 * Base container component for inline badges.
 * Provides consistent styling for the badge shell.
 * Use this when building custom badge layouts that need the same visual styling.
 */
export const BadgeContainer = forwardRef<HTMLSpanElement, BadgeContainerProps>(
  function BadgeContainer(
    { selected, editMode, className, children, ...props },
    ref,
  ) {
    return (
      <span
        ref={ref}
        className={cn(
          'group/badge relative inline-flex h-4 -translate-y-px cursor-default items-center gap-1 rounded px-1.5 align-middle text-foreground ring-1 ring-derived',
          editMode
            ? 'dark:bg-surface-1'
            : 'bg-inherit group-hover/chat-message-user:bg-hover-derived group-hover/chat-message-user:ring-derived-strong dark:group-hover/chat-message-user:ring-derived-strong',
          selected && 'ring-primary-foreground',
          className,
        )}
        contentEditable={false}
        {...props}
      >
        {children}
      </span>
    );
  },
);

export interface InlineBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Icon to display (e.g., file icon, image thumbnail, element icon) */
  icon: React.ReactNode;
  /** Label text to display */
  label: string;
  /** Whether the node is currently selected in the editor */
  selected: boolean;
  /** Whether the editor is in editable mode */
  isEditable: boolean;
  /** Callback when delete button is clicked */
  onDelete: () => void;
}

/**
 * Reusable badge component for inline nodes (attachments, mentions, etc.).
 * Displays an icon, truncated label, and shows a delete button on hover when editable.
 * Forwards refs and spreads additional props for compatibility with Base UI triggers.
 */
export const InlineBadge = forwardRef<HTMLSpanElement, InlineBadgeProps>(
  function InlineBadge(
    { icon, label, selected, isEditable, onDelete, className, ...props },
    ref,
  ) {
    const handleDelete = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete();
      },
      [onDelete],
    );

    return (
      <BadgeContainer
        ref={ref}
        selected={selected}
        editMode={isEditable}
        className={cn('text-foreground', className)}
        {...props}
      >
        {isEditable ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={handleDelete}
            onMouseDown={(e) => e.preventDefault()}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-xs' }),
              'relative size-3 shrink-0 overflow-hidden',
            )}
          >
            <span className="text-foreground transition-opacity group-hover/badge:opacity-0">
              {icon}
            </span>
            <XIcon className="absolute inset-0 size-3 opacity-0 transition-opacity group-hover/badge:opacity-100" />
          </span>
        ) : (
          <span className="text-foreground">{icon}</span>
        )}

        <span className="max-w-48 truncate font-medium text-xs leading-none">
          {label}
        </span>
      </BadgeContainer>
    );
  },
);

export interface InlineBadgeWrapperProps {
  /** The badge content to wrap (must be a single React element for PreviewCardTrigger) */
  children: React.ReactElement;
  /** Optional preview content shown on hover */
  previewContent?: React.ReactNode;
  /** Optional tooltip content shown on hover, only shown if previewContent is not provided */
  tooltipContent?: React.ReactNode;
  /** Optional view-only mode, will return a span instead of a NodeViewWrapper */
  viewOnly?: boolean;
}

function Wrapper({
  viewOnly,
  children,
}: {
  viewOnly: boolean;
  children: React.ReactNode;
}) {
  if (viewOnly)
    return <span className="inline shrink-0 px-0.5 pt-px">{children}</span>;

  return (
    <NodeViewWrapper as="span" className="inline px-0.5">
      {children}
    </NodeViewWrapper>
  );
}

/**
 * Wrapper component that provides NodeViewWrapper and optional PreviewCard.
 * Use this to wrap your InlineBadge for consistent behavior across inline node types.
 */
export function InlineBadgeWrapper({
  children,
  previewContent,
  tooltipContent,
  viewOnly,
}: InlineBadgeWrapperProps) {
  return (
    <Wrapper viewOnly={viewOnly ?? false}>
      {previewContent ? (
        <PreviewCard>
          <PreviewCardBase.Trigger
            delay={100}
            closeDelay={100}
            render={children}
          />
          {previewContent}
        </PreviewCard>
      ) : (
        <Tooltip>
          <TooltipTrigger render={children} />
          <TooltipContent>{tooltipContent}</TooltipContent>
        </Tooltip>
      )}
    </Wrapper>
  );
}
