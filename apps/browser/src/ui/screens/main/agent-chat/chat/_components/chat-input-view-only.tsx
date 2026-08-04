import { cn } from '@ui/utils';
import {
  AttachmentRegistryNodeView,
  ElementAttachmentView,
} from './rich-text/attachments';
import { MentionNodeView } from './rich-text/mentions';
import { SlashNodeView } from './rich-text/slash/slash-node-view';
import type { Content } from '@tiptap/core';
import { IconChevronDownOutline18 } from '@stagewise/icons';
import { useLayoutEffect, useRef, useState } from 'react';
import { createRafResizeObserver } from '@ui/utils/resize-observer';
import { Button } from '@stagewise/stage-ui/components/button';

const COLLAPSED_CONTENT_HEIGHT_PX = 174;

/**
 * TipTap document structure types for parsing JSON content.
 */
interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
}

interface TiptapDoc {
  type: 'doc';
  content?: TiptapNode[];
}

export interface ChatInputViewOnlyProps {
  /** TipTap JSON content */
  tipTapContent?: Content;
  /** Additional CSS classes */
  className?: string;
  /** Opens the message editor when the content area is activated. */
  onEdit?: () => void;
}

/**
 * Lightweight view-only renderer for TipTap content.
 * Renders the document as static React without initializing a TipTap editor.
 *
 * This component is used in MessageUser when not in edit mode to avoid
 * the performance overhead of creating full TipTap editor instances for
 * every message in the chat history.
 *
 * Attachment data (URLs, content) is looked up from context by the attachment
 * view components using MessageAttachmentsProvider.
 *
 * Includes max-height constraint with fade mask when content overflows.
 */
export function ChatInputViewOnly({
  tipTapContent,
  className,
  onEdit,
}: ChatInputViewOnlyProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const checkIsCollapsible = () => {
      const nextIsCollapsible =
        content.scrollHeight > COLLAPSED_CONTENT_HEIGHT_PX;
      setIsCollapsible(nextIsCollapsible);

      if (!nextIsCollapsible) setIsExpanded(false);
    };

    checkIsCollapsible();

    const { observer, disconnect } =
      createRafResizeObserver(checkIsCollapsible);
    observer.observe(content);

    return () => disconnect();
  }, [tipTapContent]);

  const handleToggleExpanded = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsExpanded((expanded) => !expanded);
  };

  const handleContentClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onEdit?.();
  };

  const handleContentKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onEdit || (event.key !== 'Enter' && event.key !== ' ')) return;

    event.preventDefault();
    onEdit();
  };

  // If no valid JSON content, render plain text fallback
  if (!tipTapContent) return null;

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          !isExpanded && 'max-h-43.5 overflow-y-hidden',
          !isExpanded && isCollapsible && 'scroll-fade-b scroll-fade-4',
        )}
        onClick={onEdit ? handleContentClick : undefined}
        onKeyDown={handleContentKeyDown}
        role={onEdit ? 'button' : undefined}
        tabIndex={onEdit ? 0 : undefined}
      >
        <div
          ref={contentRef}
          className="prose prose-sm h-full w-full max-w-none text-foreground text-sm [&_p]:m-0 [&_p]:leading-relaxed"
        >
          {typeof tipTapContent === 'string' ? (
            <p className="m-0 min-h-[1.5em] leading-relaxed">{tipTapContent}</p>
          ) : (
            (tipTapContent as TiptapDoc)?.content?.map((node, index) => (
              <RenderNode key={getNodeKey(node, index)} node={node} />
            ))
          )}
        </div>
      </div>
      {isCollapsible ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1 h-auto px-0 py-0"
          aria-expanded={isExpanded}
          onClick={handleToggleExpanded}
        >
          {isExpanded ? 'Show less' : 'Show more'}
          <IconChevronDownOutline18
            className={cn(
              'size-3 transition-transform duration-150',
              isExpanded && 'rotate-180',
            )}
          />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Generates a stable key for a TipTap node.
 * Uses the node's id attribute if available, otherwise falls back to type + index.
 */
function getNodeKey(node: TiptapNode, index: number): string {
  const id = node.attrs?.id;
  if (typeof id === 'string' && id) return `${node.type}-${id}-${index}`;

  return `${node.type}-${index}`;
}

/**
 * Recursively renders a TipTap node as React elements.
 * Attachment views look up their data from context (MessageAttachmentsProvider).
 */
function RenderNode({ node }: { node: TiptapNode }): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <p className="m-0 min-h-[1.5em] leading-relaxed">
          {node.content?.map((child, index) => (
            <RenderNode key={getNodeKey(child, index)} node={child} />
          ))}
        </p>
      );

    case 'text':
      return node.text ?? null;

    case 'hardBreak':
      return <br />;

    case 'elementAttachment':
      return (
        <ElementAttachmentView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    case 'attachment':
      return (
        <AttachmentRegistryNodeView
          viewOnly
          selected={false}
          node={{
            attrs: {
              mediaType: 'application/octet-stream',
              ...node.attrs,
            },
          }}
        />
      );

    case 'mention':
      return (
        <MentionNodeView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    case 'slash':
      return (
        <SlashNodeView
          viewOnly
          selected={false}
          node={{ attrs: node.attrs ?? {} }}
        />
      );

    default:
      // Unknown node type - try to render children if any
      if (node.content)
        return node.content.map((child, index) => (
          <RenderNode key={getNodeKey(child, index)} node={child} />
        ));

      return null;
  }
}
